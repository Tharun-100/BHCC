from __future__ import annotations

from datetime import datetime, time, timedelta

from django.contrib.auth import authenticate
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework import status
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken

from api.authentication import ReportingJWTAuthentication

from .models import Appreciation, GroupMembership, LeaderFeedback, ReportRevision, ReportingPeriod, ServiceCategory, ServiceGroup, ServiceTask, TaskUpdate, WeeklyServiceReport


def reporting_endpoint(view):
    return authentication_classes([ReportingJWTAuthentication])(view)


@api_view(["POST"])
@permission_classes([AllowAny])
def reporting_login(request):
    email = str(request.data.get("email") or "").strip().lower()
    password = request.data.get("password") or ""
    user = authenticate(request, username=email, password=password) if email and password else None
    if not user:
        return Response({"detail": "Invalid reporting credentials."}, status=status.HTTP_401_UNAUTHORIZED)
    memberships = _active_memberships(user)
    if not memberships.exists():
        return Response({"detail": "This account has no active service-reporting membership."}, status=status.HTTP_403_FORBIDDEN)
    refresh = RefreshToken.for_user(user)
    refresh["scope"] = "reporting"
    return Response({"access": str(refresh.access_token), "refresh": str(refresh), "memberships": [_membership_out(row) for row in memberships]})


def _display_name(membership: GroupMembership) -> str:
    user = membership.user
    profile = getattr(user, "profile", None)
    return (getattr(profile, "name", "") or user.get_full_name() or user.username).strip()


def _membership_out(row: GroupMembership) -> dict:
    return {
        "id": str(row.id), "groupId": str(row.group_id), "groupName": row.group.name,
        "role": row.role, "name": _display_name(row), "email": row.user.email or row.user.username,
    }


def _active_memberships(user):
    return GroupMembership.objects.filter(user=user, is_active=True, group__is_active=True).select_related("group", "user", "user__profile")


def _selected_membership(request, *, leadership=False) -> GroupMembership | None:
    membership_id = request.query_params.get("membershipId") or request.data.get("membershipId")
    rows = _active_memberships(request.user)
    if leadership:
        rows = rows.filter(role__in=[GroupMembership.Role.LEADER, GroupMembership.Role.ADMIN])
    if membership_id:
        return rows.filter(pk=membership_id).first()
    return rows.first() if rows.count() == 1 else None


def _current_period(group: ServiceGroup) -> ReportingPeriod:
    today = timezone.localdate()
    week_start = today - timedelta(days=today.weekday())
    week_end = week_start + timedelta(days=6)
    deadline = timezone.make_aware(datetime.combine(week_end, time(23, 59, 59)))
    period, _ = ReportingPeriod.objects.get_or_create(
        group=group, week_start=week_start,
        defaults={"week_end": week_end, "deadline": deadline},
    )
    return period


def _task_out(row: ServiceTask) -> dict:
    return {
        "id": str(row.id), "title": row.title, "description": row.description,
        "categoryId": str(row.category_id) if row.category_id else None,
        "category": row.category.name if row.category else None, "priority": row.priority,
        "startDate": row.start_date.isoformat() if row.start_date else None,
        "deadline": row.deadline.isoformat() if row.deadline else None, "status": row.status,
        "completionDate": row.completion_date.isoformat() if row.completion_date else None,
        "result": row.result, "evidenceUrl": row.evidence_url,
        "collaboratorIds": [str(pk) for pk in row.collaborators.values_list("pk", flat=True)],
    }


def _report_out(row: WeeklyServiceReport, include_group_data=True) -> dict:
    result = {
        "id": str(row.id), "membership": _membership_out(row.membership),
        "weekStart": row.period.week_start.isoformat(), "weekEnd": row.period.week_end.isoformat(),
        "deadline": row.period.deadline.isoformat(), "status": row.status,
        "happiness": row.happiness, "challenges": row.challenges, "needsSupport": row.needs_support,
        "submittedAt": row.submitted_at.isoformat() if row.submitted_at else None,
        "revision": row.revision,
        "appreciations": [{"recipientId": str(a.recipient_id), "recipientName": _display_name(a.recipient), "reason": a.reason, "contribution": a.contribution} for a in row.appreciations.select_related("recipient__user", "recipient__user__profile")],
        "tasks": [_task_out(task) for task in row.tasks.select_related("category").prefetch_related("collaborators")],
        "feedback": [{"leaderName": _display_name(item.leader), "comment": item.comment, "createdAt": item.created_at.isoformat()} for item in row.leader_feedback.select_related("leader__user", "leader__user__profile")],
    }
    if include_group_data:
        group = row.membership.group
        result["members"] = [_membership_out(m) for m in group.memberships.filter(is_active=True).select_related("group", "user", "user__profile")]
        result["categories"] = [{"id": str(c.id), "name": c.name} for c in group.categories.filter(is_active=True)]
    return result


def _snapshot(row: WeeklyServiceReport) -> dict:
    data = _report_out(row, include_group_data=False)
    data.pop("feedback", None)
    return data


@api_view(["GET"])
@reporting_endpoint
@permission_classes([IsAuthenticated])
def reporting_me(request):
    memberships = list(_active_memberships(request.user))
    return Response({"hasAccess": bool(memberships), "memberships": [_membership_out(row) for row in memberships]})


@api_view(["GET"])
@reporting_endpoint
@permission_classes([IsAuthenticated])
def current_report(request):
    membership = _selected_membership(request)
    if not membership:
        return Response({"detail": "Select one active group membership."}, status=status.HTTP_400_BAD_REQUEST)
    period = _current_period(membership.group)
    report, created = WeeklyServiceReport.objects.get_or_create(period=period, membership=membership)
    if created:
        previous = WeeklyServiceReport.objects.filter(membership=membership, period__week_start__lt=period.week_start).order_by("-period__week_start").first()
        if previous:
            for old in previous.tasks.filter(status=ServiceTask.Status.CARRIED_FORWARD):
                ServiceTask.objects.create(
                    report=report, owner=membership, category=old.category, title=old.title,
                    description=old.description, priority=old.priority, start_date=period.week_start,
                    deadline=old.deadline, carried_from=old,
                )
    return Response(_report_out(report))


def _clean_date(value, field):
    if not value:
        return None
    parsed = parse_date(str(value))
    if not parsed:
        raise ValueError(f"{field} must use YYYY-MM-DD format.")
    return parsed


@api_view(["GET", "PUT"])
@reporting_endpoint
@permission_classes([IsAuthenticated])
def report_detail(request, pk: int):
    report = get_object_or_404(WeeklyServiceReport.objects.select_related("membership__group", "membership__user", "period"), pk=pk)
    own = report.membership.user_id == request.user.id and report.membership.is_active
    leadership = GroupMembership.objects.filter(user=request.user, group=report.membership.group, is_active=True, role__in=[GroupMembership.Role.LEADER, GroupMembership.Role.ADMIN]).exists()
    if not (own or leadership):
        return Response({"detail": "You cannot access this report."}, status=status.HTTP_403_FORBIDDEN)
    if request.method == "GET":
        return Response(_report_out(report))
    if not own:
        return Response({"detail": "Leaders cannot modify a member's report."}, status=status.HTTP_403_FORBIDDEN)
    if report.status == WeeklyServiceReport.Status.SUBMITTED:
        return Response({"detail": "Submitted reports are locked. A group leader must reopen it."}, status=status.HTTP_409_CONFLICT)
    payload = request.data or {}
    try:
        with transaction.atomic():
            ReportRevision.objects.get_or_create(report=report, revision=report.revision, defaults={"changed_by": report.membership, "snapshot": _snapshot(report)})
            report.happiness = str(payload.get("happiness") or "").strip()
            report.challenges = str(payload.get("challenges") or "").strip()
            report.needs_support = bool(payload.get("needsSupport", False))
            report.revision += 1
            report.save()
            report.appreciations.all().delete()
            seen = set()
            for item in payload.get("appreciations") or []:
                recipient_id = str(item.get("recipientId") or "")
                if not recipient_id or recipient_id in seen:
                    continue
                recipient = get_object_or_404(GroupMembership, pk=recipient_id, group=report.membership.group, is_active=True)
                if recipient.pk == report.membership_id:
                    raise ValueError("Members cannot appreciate themselves.")
                reason = str(item.get("reason") or "").strip()
                if reason:
                    Appreciation.objects.create(report=report, recipient=recipient, reason=reason, contribution=str(item.get("contribution") or "").strip())
                    seen.add(recipient_id)
            existing = {str(task.pk): task for task in report.tasks.all()}
            retained = set()
            for item in payload.get("tasks") or []:
                title = str(item.get("title") or "").strip()
                if not title:
                    continue
                task = existing.get(str(item.get("id") or "")) or ServiceTask(report=report, owner=report.membership)
                previous_status = task.status if task.pk else ""
                next_status = str(item.get("status") or ServiceTask.Status.NOT_STARTED)
                if next_status not in ServiceTask.Status.values:
                    raise ValueError("Invalid task status.")
                category_id = item.get("categoryId")
                category = get_object_or_404(ServiceCategory, pk=category_id, group=report.membership.group, is_active=True) if category_id else None
                task.title = title; task.description = str(item.get("description") or "").strip(); task.category = category
                task.priority = str(item.get("priority") or ServiceTask.Priority.MEDIUM)
                if task.priority not in ServiceTask.Priority.values:
                    raise ValueError("Invalid task priority.")
                task.start_date = _clean_date(item.get("startDate"), "Start date")
                task.deadline = _clean_date(item.get("deadline"), "Deadline")
                task.status = next_status
                task.completion_date = _clean_date(item.get("completionDate"), "Completion date")
                task.result = str(item.get("result") or "").strip(); task.evidence_url = str(item.get("evidenceUrl") or "").strip()
                task.save(); retained.add(str(task.pk))
                collaborator_ids = item.get("collaboratorIds") or []
                task.collaborators.set(GroupMembership.objects.filter(pk__in=collaborator_ids, group=report.membership.group, is_active=True).exclude(pk=report.membership_id))
                if previous_status != next_status:
                    TaskUpdate.objects.create(task=task, changed_by=report.membership, previous_status=previous_status, new_status=next_status, note=task.result)
            report.tasks.exclude(pk__in=retained).delete()
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    return Response(_report_out(report))


@api_view(["POST"])
@reporting_endpoint
@permission_classes([IsAuthenticated])
def submit_report(request, pk: int):
    report = get_object_or_404(WeeklyServiceReport.objects.select_related("membership", "period"), pk=pk, membership__user=request.user, membership__is_active=True)
    if report.status == WeeklyServiceReport.Status.SUBMITTED:
        return Response({"detail": "This report is already submitted."}, status=status.HTTP_409_CONFLICT)
    if not report.happiness and not report.challenges and not report.tasks.exists() and not report.appreciations.exists():
        return Response({"detail": "Add at least one reflection, appreciation or service task before submitting."}, status=status.HTTP_400_BAD_REQUEST)
    report.status = WeeklyServiceReport.Status.SUBMITTED; report.submitted_at = timezone.now(); report.save(update_fields=["status", "submitted_at", "updated_at"])
    ReportRevision.objects.update_or_create(report=report, revision=report.revision, defaults={"changed_by": report.membership, "snapshot": _snapshot(report)})
    return Response(_report_out(report))


@api_view(["POST"])
@reporting_endpoint
@permission_classes([IsAuthenticated])
def reopen_report(request, pk: int):
    report = get_object_or_404(WeeklyServiceReport.objects.select_related("membership__group"), pk=pk, status=WeeklyServiceReport.Status.SUBMITTED)
    leader = GroupMembership.objects.filter(user=request.user, group=report.membership.group, is_active=True, role__in=[GroupMembership.Role.LEADER, GroupMembership.Role.ADMIN]).first()
    if not leader:
        return Response({"detail": "Only this group's leader can reopen reports."}, status=status.HTTP_403_FORBIDDEN)
    ReportRevision.objects.update_or_create(report=report, revision=report.revision, defaults={"changed_by": leader, "snapshot": _snapshot(report)})
    report.status = WeeklyServiceReport.Status.REOPENED
    report.submitted_at = None
    report.revision += 1
    report.save(update_fields=["status", "submitted_at", "revision", "updated_at"])
    return Response(_report_out(report))


@api_view(["GET"])
@reporting_endpoint
@permission_classes([IsAuthenticated])
def group_reports(request):
    membership = _selected_membership(request, leadership=True)
    if not membership:
        return Response({"detail": "Select a group you lead."}, status=status.HTTP_400_BAD_REQUEST)
    period = _current_period(membership.group)
    reports = WeeklyServiceReport.objects.filter(period=period).select_related("membership__group", "membership__user", "membership__user__profile", "period")
    submitted_ids = set(reports.filter(status=WeeklyServiceReport.Status.SUBMITTED).values_list("membership_id", flat=True))
    pending = [_membership_out(row) for row in membership.group.memberships.filter(is_active=True).exclude(pk__in=submitted_ids).select_related("group", "user", "user__profile")]
    return Response({"weekStart": period.week_start.isoformat(), "weekEnd": period.week_end.isoformat(), "reports": [_report_out(row, include_group_data=False) for row in reports], "pendingMembers": pending})


@api_view(["GET", "POST"])
@reporting_endpoint
@permission_classes([IsAuthenticated])
def manage_group(request):
    membership = _selected_membership(request)
    if not membership or membership.role != GroupMembership.Role.ADMIN:
        return Response({"detail": "Select a group for which you are a group administrator."}, status=status.HTTP_403_FORBIDDEN)
    group = membership.group
    if request.method == "POST":
        action = str(request.data.get("action") or "")
        if action == "ADD_CATEGORY":
            name = str(request.data.get("name") or "").strip()
            if not name:
                return Response({"detail": "Category name is required."}, status=status.HTTP_400_BAD_REQUEST)
            ServiceCategory.objects.update_or_create(group=group, name=name, defaults={"is_active": True})
        elif action == "ADD_MEMBER":
            email = str(request.data.get("email") or "").strip().lower()
            role = str(request.data.get("role") or GroupMembership.Role.MEMBER).upper()
            if role not in GroupMembership.Role.values:
                return Response({"detail": "Invalid reporting role."}, status=status.HTTP_400_BAD_REQUEST)
            from django.contrib.auth.models import User
            user = User.objects.filter(email__iexact=email).first() or User.objects.filter(username__iexact=email).first()
            if not user:
                return Response({"detail": "No existing BHCC login uses that email. Create the login first; reporting never creates clinical profiles."}, status=status.HTTP_404_NOT_FOUND)
            GroupMembership.objects.update_or_create(group=group, user=user, defaults={"role": role, "is_active": True})
        elif action == "UPDATE_MEMBER":
            target = get_object_or_404(GroupMembership, pk=request.data.get("memberId"), group=group)
            role = str(request.data.get("role") or target.role).upper()
            if role not in GroupMembership.Role.values:
                return Response({"detail": "Invalid reporting role."}, status=status.HTTP_400_BAD_REQUEST)
            is_active = bool(request.data.get("isActive", target.is_active))
            if target.pk == membership.pk and (not is_active or role != GroupMembership.Role.ADMIN):
                return Response({"detail": "You cannot remove your own active group-administrator access."}, status=status.HTTP_409_CONFLICT)
            target.role = role; target.is_active = is_active; target.save(update_fields=["role", "is_active"])
        else:
            return Response({"detail": "Unsupported group-management action."}, status=status.HTTP_400_BAD_REQUEST)
    members = group.memberships.select_related("group", "user", "user__profile")
    return Response({
        "group": {"id": str(group.id), "name": group.name, "description": group.description},
        "members": [{**_membership_out(row), "isActive": row.is_active} for row in members],
        "categories": [{"id": str(row.id), "name": row.name, "isActive": row.is_active} for row in group.categories.all()],
    })


@api_view(["POST"])
@reporting_endpoint
@permission_classes([IsAuthenticated])
def add_feedback(request, pk: int):
    report = get_object_or_404(WeeklyServiceReport.objects.select_related("membership__group"), pk=pk, status=WeeklyServiceReport.Status.SUBMITTED)
    leader = GroupMembership.objects.filter(user=request.user, group=report.membership.group, is_active=True, role__in=[GroupMembership.Role.LEADER, GroupMembership.Role.ADMIN]).first()
    if not leader:
        return Response({"detail": "Only this group's leader can add feedback."}, status=status.HTTP_403_FORBIDDEN)
    comment = str(request.data.get("comment") or "").strip()
    if not comment:
        return Response({"detail": "Feedback cannot be empty."}, status=status.HTTP_400_BAD_REQUEST)
    LeaderFeedback.objects.create(report=report, leader=leader, comment=comment)
    return Response(_report_out(report), status=status.HTTP_201_CREATED)
