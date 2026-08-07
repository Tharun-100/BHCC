from django.db import connection
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .models import AdminAuditLog, DataDeletionRequest, EmailDeliveryLog, UserRole
from .permissions import IsAdmin


def client_ip(request):
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
    return (forwarded.split(",")[0].strip() if forwarded else request.META.get("REMOTE_ADDR")) or None


def record_admin_action(request, *, action, target_type="", target_id="", summary="", metadata=None):
    return AdminAuditLog.objects.create(actor=request.user, action=action, target_type=target_type, target_id=str(target_id), summary=summary, metadata=metadata or {}, ip_address=client_ip(request))


@api_view(["GET"])
@permission_classes([AllowAny])
def health_live(request):
    return Response({"status": "ok", "service": "bhcc-backend", "time": timezone.now().isoformat()})


@api_view(["GET"])
@permission_classes([AllowAny])
def health_ready(request):
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
    except Exception:
        return Response({"status": "unavailable", "database": "unavailable"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    return Response({"status": "ready", "database": "ok", "time": timezone.now().isoformat()})


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def data_deletion_requests(request):
    if request.user.profile.role != UserRole.PATIENT:
        return Response({"detail": "Only patients can request deletion of their personal account data."}, status=status.HTTP_403_FORBIDDEN)
    if request.method == "POST":
        pending = DataDeletionRequest.objects.filter(patient=request.user, status=DataDeletionRequest.Status.PENDING).first()
        if pending:
            return Response({"id": str(pending.id), "status": pending.status})
        row = DataDeletionRequest.objects.create(patient=request.user, reason=str(request.data.get("reason") or "").strip())
        return Response({"id": str(row.id), "status": row.status}, status=status.HTTP_201_CREATED)
    rows = DataDeletionRequest.objects.filter(patient=request.user).order_by("-requested_at")
    return Response([{"id": str(row.id), "reason": row.reason, "status": row.status, "requestedAt": row.requested_at.isoformat(), "reviewNotes": row.review_notes} for row in rows])


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsAdmin])
def admin_operations(request):
    audits = AdminAuditLog.objects.select_related("actor", "actor__profile")[:100]
    emails = EmailDeliveryLog.objects.all()[:100]
    deletions = DataDeletionRequest.objects.select_related("patient", "patient__profile", "reviewed_by").order_by("-requested_at")[:100]
    return Response({
        "auditEvents": [{"id": str(row.id), "actor": row.actor.profile.name, "action": row.action, "targetType": row.target_type, "targetId": row.target_id, "summary": row.summary, "createdAt": row.created_at.isoformat()} for row in audits],
        "emailDeliveries": [{"id": str(row.id), "template": row.template_name, "recipientDomains": row.recipient_domains, "delivered": row.delivered, "errorType": row.error_type, "createdAt": row.created_at.isoformat()} for row in emails],
        "deletionRequests": [{"id": str(row.id), "patient": row.patient.profile.name, "patientId": row.patient.profile.patient_id, "reason": row.reason, "status": row.status, "requestedAt": row.requested_at.isoformat(), "reviewNotes": row.review_notes} for row in deletions],
    })


@api_view(["PATCH"])
@permission_classes([IsAuthenticated, IsAdmin])
def admin_deletion_request_detail(request, pk):
    row = DataDeletionRequest.objects.select_related("patient", "patient__profile").filter(pk=pk).first()
    if not row:
        return Response({"detail": "Deletion request not found."}, status=status.HTTP_404_NOT_FOUND)
    next_status = str(request.data.get("status") or "").upper()
    if next_status not in DataDeletionRequest.Status.values:
        return Response({"detail": "Invalid deletion request status."}, status=status.HTTP_400_BAD_REQUEST)
    row.status = next_status
    row.review_notes = str(request.data.get("reviewNotes") or "").strip()
    row.reviewed_by = request.user
    row.reviewed_at = timezone.now()
    row.save(update_fields=["status", "review_notes", "reviewed_by", "reviewed_at"])
    record_admin_action(request, action="DATA_DELETION_REVIEWED", target_type="DataDeletionRequest", target_id=row.id, summary=f"Request for {row.patient.profile.patient_id} marked {next_status}.")
    return Response({"id": str(row.id), "status": row.status})
