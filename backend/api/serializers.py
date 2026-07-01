from __future__ import annotations

from django.contrib.auth.models import User
from rest_framework import serializers

from .models import Appointment, Department, DoctorAvailability, Feedback, LabRegistration, UserProfile, UserRole


class UserOutSerializer(serializers.Serializer):
    id = serializers.CharField()
    name = serializers.CharField()
    email = serializers.EmailField()
    role = serializers.ChoiceField(choices=UserRole.choices)
    avatar = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    specialty = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    department = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    experience = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    fee = serializers.IntegerField(required=False, allow_null=True)
    salary = serializers.IntegerField(required=False, allow_null=True)
    staffType = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    availableDays = serializers.ListField(child=serializers.CharField(), required=False)
    workingHours = serializers.DictField(child=serializers.CharField(), required=False)
    weeklySchedule = serializers.DictField(required=False)
    patientProfile = serializers.DictField(required=False)


def user_to_out(user: User) -> dict:
    profile = getattr(user, "profile", None)
    role = profile.role if profile else UserRole.PATIENT
    name = (profile.name if profile and profile.name else (user.get_full_name() or user.first_name or "")).strip() or user.username
    weekly_schedule = getattr(profile, "weekly_schedule", {}) if profile else {}
    if profile and not weekly_schedule:
        weekly_schedule = {
            day: [{"start": profile.working_hours_start, "end": profile.working_hours_end}]
            for day in profile.available_days
        }
    available_days = [day for day, windows in weekly_schedule.items() if windows] if weekly_schedule else (getattr(profile, "available_days", []) if profile else [])
    data = {
        "id": str(user.id),
        "name": name,
        "email": user.email or user.username,
        "role": role,
        "specialty": getattr(profile, "specialty", "") or None,
        "department": getattr(profile, "department", "") or None,
        "experience": getattr(profile, "experience", "") or None,
        "fee": getattr(profile, "fee", None),
        "salary": getattr(profile, "salary", None),
        "staffType": getattr(profile, "staff_type", "") or None,
        "availableDays": available_days,
        "workingHours": {
            "start": getattr(profile, "working_hours_start", "09:00") if profile else "09:00",
            "end": getattr(profile, "working_hours_end", "17:00") if profile else "17:00",
        },
        "weeklySchedule": weekly_schedule,
    }
    if profile:
        data["patientProfile"] = {
            "address": profile.address,
            "phoneNo": profile.phone_no,
            "profession": profile.profession,
            "isMarried": profile.is_married,
            "hasChildren": profile.has_children,
            "annualIncomeRange": profile.annual_income_range,
            "religion": profile.religion,
            "iskconVisited": profile.iskcon_visited,
            "iskconVisitFrequency": profile.iskcon_visit_frequency,
            "chantsHareKrishna": profile.chants_hare_krishna,
            "mahamantraRounds": profile.mahamantra_rounds,
            "prabhupadaBooks": {
                "small": profile.prabhupada_small_books_status,
                "medium": profile.prabhupada_medium_books_status,
                "big": profile.prabhupada_big_books_status,
            },
        }
    return data


class DepartmentSerializer(serializers.ModelSerializer):
    id = serializers.CharField(source="pk", read_only=True)
    baseFee = serializers.IntegerField(source="base_fee")

    class Meta:
        model = Department
        fields = ["id", "name", "icon", "description", "baseFee"]


class AppointmentSerializer(serializers.ModelSerializer):
    id = serializers.CharField(source="pk", read_only=True)
    patientId = serializers.CharField(source="patient_id", read_only=True)
    doctorId = serializers.CharField(source="doctor_id")
    patientName = serializers.CharField(source="patient_name")
    doctorName = serializers.CharField(source="doctor_name")

    class Meta:
        model = Appointment
        fields = [
            "id",
            "patientId",
            "patientName",
            "doctorId",
            "doctorName",
            "department",
            "date",
            "time",
            "fee",
            "status",
            "paymentId",
            "paymentStatus",
        ]

    paymentId = serializers.CharField(source="payment_id", allow_blank=True, required=False)
    paymentStatus = serializers.CharField(source="payment_status", allow_blank=True, required=False)


class FeedbackOutSerializer(serializers.Serializer):
    id = serializers.CharField()
    patientName = serializers.CharField()
    rating = serializers.IntegerField()
    comment = serializers.CharField()
    date = serializers.CharField()


class LabRegistrationSerializer(serializers.ModelSerializer):
    id = serializers.CharField(source="pk", read_only=True)
    time = serializers.SerializerMethodField()

    class Meta:
        model = LabRegistration
        fields = ["id", "name", "age", "fee", "time"]

    def get_time(self, obj: LabRegistration) -> str:
        return obj.created_at.astimezone().strftime("%I:%M %p")


class AvailabilitySerializer(serializers.Serializer):
    doctorId = serializers.CharField()
    date = serializers.DateField()
    slots = serializers.ListField(child=serializers.CharField())
