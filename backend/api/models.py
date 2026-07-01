from __future__ import annotations

from django.contrib.auth.models import User
from django.db import models


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
