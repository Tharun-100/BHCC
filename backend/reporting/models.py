from __future__ import annotations

from django.contrib.auth.models import User
from django.db import models


class ServiceGroup(models.Model):
    name = models.CharField(max_length=140, unique=True)
    description = models.TextField(blank=True, default="")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return self.name


class GroupMembership(models.Model):
    class Role(models.TextChoices):
        MEMBER = "MEMBER", "Member"
        LEADER = "LEADER", "Group leader"
        ADMIN = "ADMIN", "Group administrator"

    group = models.ForeignKey(ServiceGroup, on_delete=models.PROTECT, related_name="memberships")
    user = models.ForeignKey(User, on_delete=models.PROTECT, related_name="service_group_memberships")
    role = models.CharField(max_length=12, choices=Role.choices, default=Role.MEMBER)
    is_active = models.BooleanField(default=True)
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["group", "user"], name="unique_service_group_membership")]
        ordering = ["group__name", "user__first_name", "user__username"]

    def __str__(self) -> str:
        return f"{self.group}: {self.user} ({self.role})"


class ServiceCategory(models.Model):
    group = models.ForeignKey(ServiceGroup, on_delete=models.PROTECT, related_name="categories")
    name = models.CharField(max_length=100)
    is_active = models.BooleanField(default=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["group", "name"], name="unique_group_service_category")]
        ordering = ["name"]

    def __str__(self) -> str:
        return f"{self.group}: {self.name}"


class ReportingPeriod(models.Model):
    class Status(models.TextChoices):
        OPEN = "OPEN", "Open"
        CLOSED = "CLOSED", "Closed"

    group = models.ForeignKey(ServiceGroup, on_delete=models.PROTECT, related_name="reporting_periods")
    week_start = models.DateField()
    week_end = models.DateField()
    deadline = models.DateTimeField()
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.OPEN)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["group", "week_start"], name="unique_group_reporting_week")]
        ordering = ["-week_start"]


class WeeklyServiceReport(models.Model):
    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        SUBMITTED = "SUBMITTED", "Submitted"
        REOPENED = "REOPENED", "Reopened"

    period = models.ForeignKey(ReportingPeriod, on_delete=models.PROTECT, related_name="reports")
    membership = models.ForeignKey(GroupMembership, on_delete=models.PROTECT, related_name="weekly_reports")
    happiness = models.TextField(blank=True, default="")
    challenges = models.TextField(blank=True, default="")
    needs_support = models.BooleanField(default=False)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.DRAFT)
    submitted_at = models.DateTimeField(null=True, blank=True)
    revision = models.PositiveIntegerField(default=1)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["period", "membership"], name="one_weekly_report_per_member")]
        ordering = ["-period__week_start", "membership__user__first_name"]


class Appreciation(models.Model):
    report = models.ForeignKey(WeeklyServiceReport, on_delete=models.CASCADE, related_name="appreciations")
    recipient = models.ForeignKey(GroupMembership, on_delete=models.PROTECT, related_name="appreciations_received")
    reason = models.TextField()
    contribution = models.CharField(max_length=180, blank=True, default="")

    class Meta:
        constraints = [models.UniqueConstraint(fields=["report", "recipient"], name="one_appreciation_per_report_recipient")]


class ServiceTask(models.Model):
    class Priority(models.TextChoices):
        LOW = "LOW", "Low"
        MEDIUM = "MEDIUM", "Medium"
        HIGH = "HIGH", "High"

    class Status(models.TextChoices):
        NOT_STARTED = "NOT_STARTED", "Not started"
        IN_PROGRESS = "IN_PROGRESS", "In progress"
        COMPLETED = "COMPLETED", "Completed"
        CARRIED_FORWARD = "CARRIED_FORWARD", "Carried forward"
        CANCELLED = "CANCELLED", "Cancelled"

    report = models.ForeignKey(WeeklyServiceReport, on_delete=models.PROTECT, related_name="tasks")
    owner = models.ForeignKey(GroupMembership, on_delete=models.PROTECT, related_name="service_tasks")
    category = models.ForeignKey(ServiceCategory, on_delete=models.SET_NULL, null=True, blank=True, related_name="tasks")
    title = models.CharField(max_length=180)
    description = models.TextField(blank=True, default="")
    priority = models.CharField(max_length=10, choices=Priority.choices, default=Priority.MEDIUM)
    start_date = models.DateField(null=True, blank=True)
    deadline = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.NOT_STARTED)
    completion_date = models.DateField(null=True, blank=True)
    result = models.TextField(blank=True, default="")
    evidence_url = models.URLField(blank=True, default="")
    carried_from = models.ForeignKey("self", on_delete=models.SET_NULL, null=True, blank=True, related_name="carry_forwards")
    collaborators = models.ManyToManyField(GroupMembership, blank=True, related_name="collaborative_tasks")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["deadline", "id"]


class TaskUpdate(models.Model):
    task = models.ForeignKey(ServiceTask, on_delete=models.CASCADE, related_name="history")
    changed_by = models.ForeignKey(GroupMembership, on_delete=models.PROTECT, related_name="task_updates")
    previous_status = models.CharField(max_length=20, blank=True, default="")
    new_status = models.CharField(max_length=20)
    note = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)


class LeaderFeedback(models.Model):
    report = models.ForeignKey(WeeklyServiceReport, on_delete=models.PROTECT, related_name="leader_feedback")
    leader = models.ForeignKey(GroupMembership, on_delete=models.PROTECT, related_name="feedback_given")
    comment = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)


class ReportRevision(models.Model):
    report = models.ForeignKey(WeeklyServiceReport, on_delete=models.PROTECT, related_name="revisions")
    revision = models.PositiveIntegerField()
    changed_by = models.ForeignKey(GroupMembership, on_delete=models.PROTECT, related_name="report_revisions")
    snapshot = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["report", "revision"], name="unique_weekly_report_revision")]
