from __future__ import annotations

from django.contrib.auth.models import User
from django.db import models
from django.db import transaction


class UserRole(models.TextChoices):
    PUBLIC = "PUBLIC"
    PATIENT = "PATIENT"
    DOCTOR = "DOCTOR"
    ADMIN = "ADMIN"
    COUNTER = "COUNTER"
    STAFF = "STAFF"


class UserProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="profile")
    role = models.CharField(max_length=20, choices=UserRole.choices, default=UserRole.PATIENT)
    name = models.CharField(max_length=120, blank=True, default="")

    address = models.TextField(blank=True, default="")
    phone_no = models.CharField(max_length=20, blank=True, default="")
    profession = models.CharField(max_length=120, blank=True, default="")
    staff_type = models.CharField(max_length=80, blank=True, default="")
    salary = models.PositiveIntegerField(null=True, blank=True)
    is_married = models.BooleanField(default=False)
    has_children = models.BooleanField(default=False)
    annual_income_range = models.CharField(max_length=40, blank=True, default="")
    religion = models.CharField(max_length=80, blank=True, default="")
    iskcon_visited = models.BooleanField(default=False)
    iskcon_visit_frequency = models.CharField(max_length=120, blank=True, default="")
    chants_hare_krishna = models.BooleanField(default=False)
    mahamantra_rounds = models.PositiveSmallIntegerField(null=True, blank=True)
    prabhupada_small_books_status = models.CharField(max_length=30, blank=True, default="")
    prabhupada_medium_books_status = models.CharField(max_length=30, blank=True, default="")
    prabhupada_big_books_status = models.CharField(max_length=30, blank=True, default="")

    department = models.CharField(max_length=120, blank=True, default="")
    specialty = models.CharField(max_length=120, blank=True, default="")
    experience = models.CharField(max_length=50, blank=True, default="")
    fee = models.PositiveIntegerField(null=True, blank=True)
    available_days = models.JSONField(default=list, blank=True)
    working_hours_start = models.CharField(max_length=5, blank=True, default="09:00")
    working_hours_end = models.CharField(max_length=5, blank=True, default="17:00")
    weekly_schedule = models.JSONField(default=dict, blank=True)
    email_verified_at = models.DateTimeField(null=True, blank=True)
    verification_sent_at = models.DateTimeField(null=True, blank=True)
    password_reset_sent_at = models.DateTimeField(null=True, blank=True)
    patient_id = models.CharField(max_length=13, unique=True, null=True, blank=True)
    medical_registration_number = models.CharField(max_length=80, blank=True, default="")
    registration_council = models.CharField(max_length=120, blank=True, default="")
    qualification = models.CharField(max_length=160, blank=True, default="")

    def __str__(self) -> str:
        return f"{self.user_id}:{self.role}"


class Department(models.Model):
    name = models.CharField(max_length=120, unique=True)
    icon = models.CharField(max_length=80, blank=True, default="")
    description = models.TextField(blank=True, default="")
    base_fee = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return self.name


class Appointment(models.Model):
    class Status(models.TextChoices):
        UPCOMING = "Upcoming"
        COMPLETED = "Completed"
        CANCELLED = "Cancelled"

    patient = models.ForeignKey(User, on_delete=models.CASCADE, related_name="patient_appointments")
    doctor = models.ForeignKey(User, on_delete=models.CASCADE, related_name="doctor_appointments")
    patient_name = models.CharField(max_length=120, blank=True, default="")
    doctor_name = models.CharField(max_length=120, blank=True, default="")
    department = models.CharField(max_length=120, blank=True, default="")
    date = models.DateField()
    time = models.CharField(max_length=5)
    fee = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.UPCOMING)
    payment_id = models.CharField(max_length=120, blank=True, default="")

    payment_status = models.CharField(max_length=20, blank=True, default="Pending")
    order_id = models.CharField(max_length=120, blank=True, default="")
    gateway_order_id = models.CharField(max_length=120, blank=True, default="")
    gateway_fee = models.PositiveIntegerField(default=0)
    total_amount = models.PositiveIntegerField(default=0)
    total_amount_paise = models.PositiveIntegerField(default=0)
    gateway_details = models.JSONField(null=True, blank=True)
    confirmation_email_sent_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class Feedback(models.Model):
    patient = models.ForeignKey(User, on_delete=models.CASCADE, related_name="feedback_entries")
    patient_name = models.CharField(max_length=120)
    patient_email = models.EmailField()
    rating = models.PositiveIntegerField(default=5)
    comment = models.TextField()
    approved = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)


class LabRegistration(models.Model):
    name = models.CharField(max_length=120)
    age = models.PositiveIntegerField()
    fee = models.PositiveIntegerField(default=200)
    created_at = models.DateTimeField(auto_now_add=True)


class DoctorAvailability(models.Model):
    doctor = models.ForeignKey(User, on_delete=models.CASCADE, related_name="availabilities")
    date = models.DateField()
    slots = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("doctor", "date")


class EmailOTP(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="email_otps")
    code = models.CharField(max_length=6)
    purpose = models.CharField(max_length=40, default="STAFF_LOGIN")
    expires_at = models.DateTimeField()
    consumed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"{self.user_id}:{self.purpose}:{self.created_at:%Y-%m-%d %H:%M}"


class PatientIdentifierSequence(models.Model):
    last_value = models.PositiveBigIntegerField(default=0)


class AttendanceRecord(models.Model):
    class Status(models.TextChoices):
        PRESENT = "PRESENT", "Present"
        LATE = "LATE", "Late"
        HALF_DAY = "HALF_DAY", "Half Day"
        ABSENT = "ABSENT", "Absent"
        LEAVE = "LEAVE", "On Leave"
        HOLIDAY = "HOLIDAY", "Holiday"

    employee = models.ForeignKey(User, on_delete=models.CASCADE, related_name="attendance_records")
    date = models.DateField()
    scheduled_start = models.CharField(max_length=5, blank=True, default="")
    scheduled_end = models.CharField(max_length=5, blank=True, default="")
    checked_in_at = models.DateTimeField(null=True, blank=True)
    checked_out_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PRESENT)
    late_minutes = models.PositiveIntegerField(default=0)
    worked_minutes = models.PositiveIntegerField(default=0)
    source = models.CharField(max_length=30, default="WEB")
    admin_notes = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["employee", "date"], name="unique_daily_attendance")]
        ordering = ["-date", "employee_id"]


class LeaveRequest(models.Model):
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"

    employee = models.ForeignKey(User, on_delete=models.CASCADE, related_name="leave_requests")
    leave_type = models.CharField(max_length=40)
    start_date = models.DateField()
    end_date = models.DateField()
    reason = models.TextField()
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    reviewed_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="reviewed_leave_requests")
    reviewed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)


class AttendanceAuditLog(models.Model):
    attendance = models.ForeignKey(AttendanceRecord, on_delete=models.CASCADE, related_name="audit_logs")
    changed_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="attendance_changes")
    previous_values = models.JSONField(default=dict)
    new_values = models.JSONField(default=dict)
    reason = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)


class Consultation(models.Model):
    class Status(models.TextChoices):
        STARTED = "STARTED", "Started"
        COMPLETED = "COMPLETED", "Completed"

    appointment = models.OneToOneField(Appointment, on_delete=models.CASCADE, related_name="consultation")
    doctor = models.ForeignKey(User, on_delete=models.PROTECT, related_name="consultations_given")
    patient = models.ForeignKey(User, on_delete=models.PROTECT, related_name="consultations_received")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.STARTED)
    symptoms = models.TextField(blank=True, default="")
    observations = models.TextField(blank=True, default="")
    diagnosis = models.TextField(blank=True, default="")
    advice = models.TextField(blank=True, default="")
    follow_up_date = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class Prescription(models.Model):
    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        FINALIZED = "FINALIZED", "Finalized"
        SUPERSEDED = "SUPERSEDED", "Superseded"

    consultation = models.ForeignKey(Consultation, on_delete=models.CASCADE, related_name="prescriptions")
    prescription_number = models.CharField(max_length=30, unique=True)
    version = models.PositiveIntegerField(default=1)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    finalized_at = models.DateTimeField(null=True, blank=True)
    signature_sha256 = models.CharField(max_length=64, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["consultation", "version"], name="unique_prescription_version")]
        ordering = ["-created_at"]


class PrescriptionMedicine(models.Model):
    prescription = models.ForeignKey(Prescription, on_delete=models.CASCADE, related_name="medicines")
    name = models.CharField(max_length=160)
    strength = models.CharField(max_length=80, blank=True, default="")
    dosage_form = models.CharField(max_length=80, blank=True, default="")
    dose = models.CharField(max_length=80)
    frequency = models.CharField(max_length=100)
    duration = models.CharField(max_length=100)
    food_instructions = models.CharField(max_length=120, blank=True, default="")
    notes = models.TextField(blank=True, default="")
    position = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["position", "id"]


class PrescriptionTest(models.Model):
    prescription = models.ForeignKey(Prescription, on_delete=models.CASCADE, related_name="tests")
    name = models.CharField(max_length=160)
    instructions = models.TextField(blank=True, default="")
    position = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["position", "id"]


class PrescriptionAuditLog(models.Model):
    prescription = models.ForeignKey(Prescription, on_delete=models.CASCADE, related_name="audit_logs")
    performed_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="prescription_actions")
    action = models.CharField(max_length=40)
    summary = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)


class ConsentRecord(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="consent_records")
    document_type = models.CharField(max_length=40)
    document_version = models.CharField(max_length=20)
    accepted_at = models.DateTimeField(auto_now_add=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=300, blank=True, default="")

    class Meta:
        constraints = [models.UniqueConstraint(fields=["user", "document_type", "document_version"], name="unique_user_document_consent")]


class DataDeletionRequest(models.Model):
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"
        COMPLETED = "COMPLETED", "Completed"

    patient = models.ForeignKey(User, on_delete=models.PROTECT, related_name="data_deletion_requests")
    reason = models.TextField(blank=True, default="")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    reviewed_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="reviewed_data_deletion_requests")
    review_notes = models.TextField(blank=True, default="")
    requested_at = models.DateTimeField(auto_now_add=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)


class AdminAuditLog(models.Model):
    actor = models.ForeignKey(User, on_delete=models.PROTECT, related_name="admin_audit_events")
    action = models.CharField(max_length=80)
    target_type = models.CharField(max_length=80, blank=True, default="")
    target_id = models.CharField(max_length=80, blank=True, default="")
    summary = models.TextField(blank=True, default="")
    metadata = models.JSONField(default=dict, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]


class EmailDeliveryLog(models.Model):
    template_name = models.CharField(max_length=80)
    recipient_domains = models.JSONField(default=list, blank=True)
    delivered = models.BooleanField(default=False)
    error_type = models.CharField(max_length=120, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]


def allocate_patient_id(profile: UserProfile) -> str:
    if profile.patient_id:
        return profile.patient_id
    with transaction.atomic():
        sequence, _ = PatientIdentifierSequence.objects.select_for_update().get_or_create(pk=1)
        sequence.last_value += 1
        sequence.save(update_fields=["last_value"])
        patient_id = f"BHCC{sequence.last_value:09d}"
        UserProfile.objects.filter(pk=profile.pk, patient_id__isnull=True).update(patient_id=patient_id)
        profile.patient_id = patient_id
        return patient_id
