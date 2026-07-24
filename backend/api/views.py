from __future__ import annotations
import hmac
import logging
import os
import secrets
from datetime import date as date_type, timedelta

from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.conf import settings
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail

from .models import Appointment, Department, DoctorAvailability, EmailOTP, Feedback, LabRegistration, UserProfile, UserRole
from .permissions import IsAdmin, IsCounter
from .serializers import (
    AppointmentSerializer,
    DepartmentSerializer,
    LabRegistrationSerializer,
    AvailabilitySerializer,
    user_to_out,
)


BOOK_STATUS_VALUES = {"Yet to Start", "Just Started", "Ongoing", "Completed"}
INCOME_RANGE_VALUES = {"Less than 1 lakh", "1-5 Lakhs", "Greater than 5 Lakhs"}
SPIRITUAL_FIELD_DISABLED_RELIGIONS = {"muslim", "christian"}
STAFF_ROLES = {UserRole.DOCTOR, UserRole.ADMIN, UserRole.COUNTER, UserRole.STAFF}
logger = logging.getLogger(__name__)
WEEK_DAYS = {"Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"}


def _token_pair(user: User) -> dict:
    refresh = RefreshToken.for_user(user)
    return {"access": str(refresh.access_token), "refresh": str(refresh)}


def _ensure_profile(user: User) -> UserProfile:
    default_role = UserRole.ADMIN if user.is_superuser else UserRole.PATIENT
    profile, _ = UserProfile.objects.get_or_create(
        user=user,
        defaults={"role": default_role, "name": user.get_full_name() or user.username},
    )
    if user.is_superuser and profile.role != UserRole.ADMIN:
        profile.role = UserRole.ADMIN
        profile.save(update_fields=["role"])
    return profile


def _truthy(value) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"true", "yes", "1", "on"}
    return bool(value)


def _patient_profile_payload(payload: dict) -> tuple[dict, str | None]:
    religion = str(payload.get("religion") or "").strip()
    annual_income_range = str(payload.get("annualIncomeRange") or "").strip()
    if annual_income_range and annual_income_range not in INCOME_RANGE_VALUES:
        return {}, "Please select a valid annual income range."

    books = payload.get("prabhupadaBooks") or {}
    small_books = str(books.get("small") or "").strip()
    medium_books = str(books.get("medium") or "").strip()
    big_books = str(books.get("big") or "").strip()
    for value in (small_books, medium_books, big_books):
        if value and value not in BOOK_STATUS_VALUES:
            return {}, "Please select a valid Srila Prabhupada book status."

    can_show_spiritual_fields = religion.lower() not in SPIRITUAL_FIELD_DISABLED_RELIGIONS
    rounds_raw = payload.get("mahamantraRounds")
    rounds = None
    if can_show_spiritual_fields and rounds_raw not in (None, ""):
        try:
            rounds = max(0, int(rounds_raw))
        except (TypeError, ValueError):
            return {}, "Please enter a valid number of Hare Krishna Mahamantra rounds."

    has_children = _truthy(payload.get("hasChildren")) if _truthy(payload.get("isMarried")) else False
    data = {
        "address": str(payload.get("address") or "").strip(),
        "phone_no": str(payload.get("phoneNo") or "").strip(),
        "profession": str(payload.get("profession") or "").strip(),
        "is_married": _truthy(payload.get("isMarried")),
        "has_children": has_children,
        "annual_income_range": annual_income_range,
        "religion": religion,
        "iskcon_visited": _truthy(payload.get("iskconVisited")) if can_show_spiritual_fields else False,
        "iskcon_visit_frequency": str(payload.get("iskconVisitFrequency") or "").strip() if can_show_spiritual_fields else "",
        "chants_hare_krishna": _truthy(payload.get("chantsHareKrishna")) if can_show_spiritual_fields else False,
        "mahamantra_rounds": rounds if can_show_spiritual_fields else None,
        "prabhupada_small_books_status": small_books if can_show_spiritual_fields else "",
        "prabhupada_medium_books_status": medium_books if can_show_spiritual_fields else "",
        "prabhupada_big_books_status": big_books if can_show_spiritual_fields else "",
    }
    return data, None


def _common_profile_payload(payload: dict) -> dict:
    return {
        "address": str(payload.get("address") or "").strip(),
        "phone_no": str(payload.get("phoneNo") or "").strip(),
        "profession": str(payload.get("profession") or "").strip(),
    }


def _spiritual_profile_payload(payload: dict) -> tuple[dict, str | None]:
    religion = str(payload.get("religion") or "").strip()
    books = payload.get("prabhupadaBooks") or {}
    small_books = str(books.get("small") or "").strip()
    medium_books = str(books.get("medium") or "").strip()
    big_books = str(books.get("big") or "").strip()
    for value in (small_books, medium_books, big_books):
        if value and value not in BOOK_STATUS_VALUES:
            return {}, "Please select a valid Srila Prabhupada book status."

    can_show_spiritual_fields = religion.lower() not in SPIRITUAL_FIELD_DISABLED_RELIGIONS
    rounds_raw = payload.get("mahamantraRounds")
    rounds = None
    if can_show_spiritual_fields and rounds_raw not in (None, ""):
        try:
            rounds = max(0, int(rounds_raw))
        except (TypeError, ValueError):
            return {}, "Please enter a valid number of Hare Krishna Mahamantra rounds."

    return {
        "religion": religion,
        "iskcon_visited": _truthy(payload.get("iskconVisited")) if can_show_spiritual_fields else False,
        "iskcon_visit_frequency": str(payload.get("iskconVisitFrequency") or "").strip() if can_show_spiritual_fields else "",
        "chants_hare_krishna": _truthy(payload.get("chantsHareKrishna")) if can_show_spiritual_fields else False,
        "mahamantra_rounds": rounds if can_show_spiritual_fields else None,
        "prabhupada_small_books_status": small_books if can_show_spiritual_fields else "",
        "prabhupada_medium_books_status": medium_books if can_show_spiritual_fields else "",
        "prabhupada_big_books_status": big_books if can_show_spiritual_fields else "",
    }, None


def _weekly_schedule_payload(payload: dict) -> dict:
    raw_schedule = payload.get("weeklySchedule") or {}
    schedule: dict[str, list[dict[str, str]]] = {}
    if not isinstance(raw_schedule, dict):
        return schedule

    for day, windows in raw_schedule.items():
        day_name = str(day).strip()
        if day_name not in WEEK_DAYS or not isinstance(windows, list):
            continue
        clean_windows = []
        for window in windows:
            if not isinstance(window, dict):
                continue
            start = str(window.get("start") or "").strip()
            end = str(window.get("end") or "").strip()
            if len(start) == 5 and len(end) == 5 and start < end:
                clean_windows.append({"start": start, "end": end})
        if clean_windows:
            schedule[day_name] = clean_windows
    return schedule


def _send_staff_otp_email(user: User, code: str) -> bool:
    api_key = os.getenv("SENDGRID_API_KEY", "").strip()
    from_email = _sendgrid_from_email()
    if not api_key:
        return False
    if not from_email:
        logger.warning("SENDGRID_FROM_EMAIL is missing; staff OTP email was not sent.")
        return False

    mail = Mail(
        from_email=from_email,
        to_emails=user.email or user.username,
        subject="[BHCC] Staff login OTP",
        html_content=f"<p>Your BHCC staff login OTP is <strong>{code}</strong>.</p><p>This code expires in 10 minutes.</p>",
    )
    try:
        SendGridAPIClient(api_key).send(mail)
    except Exception as exc:
        logger.warning("Failed to send staff OTP email via SendGrid: %s", exc)
        return False
    return True


def _sendgrid_from_email() -> str:
    return os.getenv("SENDGRID_FROM_EMAIL", "").strip() or os.getenv("CLINIC_TO_EMAIL", "").strip()


@api_view(["POST"])
@permission_classes([AllowAny])
def auth_login(request):
    email = (request.data.get("email") or "").strip().lower()
    password = request.data.get("password") or ""

    if not email or not password:
        return Response({"detail": "Email and password are required."}, status=status.HTTP_400_BAD_REQUEST)

    user = authenticate(request, username=email, password=password)
    if not user:
        return Response({"detail": "Invalid credentials."}, status=status.HTTP_401_UNAUTHORIZED)

    _ensure_profile(user)

    data = _token_pair(user)
    data["user"] = user_to_out(user)
    return Response(data)


@api_view(["POST"])
@permission_classes([AllowAny])
def auth_staff_request_otp(request):
    email = (request.data.get("email") or "").strip().lower()
    password = request.data.get("password") or ""
    selected_role = str(request.data.get("role") or "").strip().upper()

    if not email or not password:
        return Response({"detail": "Email and password are required."}, status=status.HTTP_400_BAD_REQUEST)

    user = authenticate(request, username=email, password=password)
    if not user:
        return Response({"detail": "Invalid credentials."}, status=status.HTTP_401_UNAUTHORIZED)

    profile = _ensure_profile(user)
    if profile.role not in STAFF_ROLES:
        return Response({"detail": "This is not a staff account."}, status=status.HTTP_403_FORBIDDEN)
    if selected_role and profile.role != selected_role:
        return Response({"detail": f"This account is {profile.role}. Please select the correct portal."}, status=status.HTTP_403_FORBIDDEN)
    if profile.role != UserRole.ADMIN:
        data = _token_pair(user)
        data["user"] = user_to_out(user)
        data["requiresOtp"] = False
        return Response(data)

    EmailOTP.objects.filter(user=user, purpose="STAFF_LOGIN", consumed_at__isnull=True).update(consumed_at=timezone.now())
    code = f"{secrets.randbelow(1_000_000):06d}"
    otp = EmailOTP.objects.create(
        user=user,
        code=code,
        purpose="STAFF_LOGIN",
        expires_at=timezone.now() + timedelta(minutes=10),
    )

    sent = _send_staff_otp_email(user, code)
    response = {"challengeId": str(otp.id), "email": user.email or user.username, "otpSent": sent, "requiresOtp": True}
    if not sent and settings.DEBUG:
        response["devOtp"] = code
        response["detail"] = "Email is not configured. Use the development OTP shown here."
    elif not sent:
        response["detail"] = "OTP could not be emailed. Please contact the administrator."
    return Response(response)


@api_view(["POST"])
@permission_classes([AllowAny])
def auth_staff_verify_otp(request):
    challenge_id = request.data.get("challengeId")
    code = str(request.data.get("otp") or "").strip()

    if not challenge_id or not code:
        return Response({"detail": "Challenge ID and OTP are required."}, status=status.HTTP_400_BAD_REQUEST)

    otp = EmailOTP.objects.select_related("user", "user__profile").filter(pk=challenge_id, purpose="STAFF_LOGIN").first()
    if not otp or otp.consumed_at:
        return Response({"detail": "Invalid or expired OTP."}, status=status.HTTP_400_BAD_REQUEST)
    if otp.expires_at < timezone.now():
        otp.consumed_at = timezone.now()
        otp.save(update_fields=["consumed_at"])
        return Response({"detail": "OTP expired. Please request a new code."}, status=status.HTTP_400_BAD_REQUEST)
    if otp.code != code:
        return Response({"detail": "Invalid OTP."}, status=status.HTTP_400_BAD_REQUEST)

    profile = _ensure_profile(otp.user)
    if profile.role not in STAFF_ROLES:
        return Response({"detail": "This is not a staff account."}, status=status.HTTP_403_FORBIDDEN)

    otp.consumed_at = timezone.now()
    otp.save(update_fields=["consumed_at"])

    data = _token_pair(otp.user)
    data["user"] = user_to_out(otp.user)
    return Response(data)


@api_view(["POST"])
@permission_classes([AllowAny])
def auth_register_patient(request):
    name = (request.data.get("name") or "").strip()
    email = (request.data.get("email") or "").strip().lower()
    password = request.data.get("password") or ""
    profile_data, profile_error = _patient_profile_payload(request.data)

    if not name or not email or not password:
        return Response({"detail": "Name, email, and password are required."}, status=status.HTTP_400_BAD_REQUEST)
    if profile_error:
        return Response({"detail": profile_error}, status=status.HTTP_400_BAD_REQUEST)
    required_profile_fields = ["address", "phone_no", "profession", "annual_income_range", "religion"]
    if any(not profile_data[field] for field in required_profile_fields):
        return Response(
            {"detail": "Address, phone number, profession, annual income range, and religion are required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if User.objects.filter(username=email).exists():
        return Response({"detail": "An account with this email already exists."}, status=status.HTTP_400_BAD_REQUEST)

    user = User.objects.create_user(username=email, email=email, password=password, first_name=name)
    UserProfile.objects.create(user=user, role=UserRole.PATIENT, name=name, **profile_data)

    data = _token_pair(user)
    data["user"] = user_to_out(user)
    return Response(data, status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def auth_me(request):
    user = request.user
    _ensure_profile(user)
    return Response(user_to_out(user))


@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
def patient_profile(request):
    profile = _ensure_profile(request.user)
    if profile.role != UserRole.PATIENT:
        return Response({"detail": "Only patients can access patient profile details."}, status=status.HTTP_403_FORBIDDEN)

    if request.method == "GET":
        return Response(user_to_out(request.user))

    payload = request.data or {}
    profile_data, profile_error = _patient_profile_payload(payload)
    if profile_error:
        return Response({"detail": profile_error}, status=status.HTTP_400_BAD_REQUEST)

    name = str(payload.get("name") or "").strip()
    if name:
        profile.name = name
        request.user.first_name = name

    for field, value in profile_data.items():
        setattr(profile, field, value)

    request.user.save(update_fields=["first_name"])
    profile.save()
    return Response(user_to_out(request.user))


@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
def staff_profile(request):
    profile = _ensure_profile(request.user)
    if profile.role not in STAFF_ROLES:
        return Response({"detail": "Only staff can access staff profile details."}, status=status.HTTP_403_FORBIDDEN)

    if request.method == "GET":
        return Response(user_to_out(request.user))

    payload = request.data or {}
    name = str(payload.get("name") or "").strip()
    common_profile = _common_profile_payload(payload)
    spiritual_profile, spiritual_error = _spiritual_profile_payload(payload)
    if spiritual_error:
        return Response({"detail": spiritual_error}, status=status.HTTP_400_BAD_REQUEST)

    if name:
        profile.name = name
        request.user.first_name = name

    for field, value in common_profile.items():
        setattr(profile, field, value)
    for field, value in spiritual_profile.items():
        setattr(profile, field, value)

    if profile.role == UserRole.DOCTOR:
        profile.department = str(payload.get("department") or "").strip()
        profile.specialty = str(payload.get("specialty") or "").strip()
        profile.experience = str(payload.get("experience") or "").strip()
        if "weeklySchedule" in payload:
            weekly_schedule = _weekly_schedule_payload(payload)
            profile.weekly_schedule = weekly_schedule
            profile.available_days = list(weekly_schedule.keys())
            if weekly_schedule:
                first_window = next(iter(weekly_schedule.values()))[0]
                profile.working_hours_start = first_window["start"]
                profile.working_hours_end = first_window["end"]

    request.user.save(update_fields=["first_name"])
    profile.save()
    return Response(user_to_out(request.user))


@api_view(["PATCH"])
@permission_classes([IsAuthenticated, IsAdmin])
def admin_update_doctor_schedule(request, pk: int):
    doctor = get_object_or_404(User, pk=pk, profile__role=UserRole.DOCTOR)
    profile = doctor.profile
    weekly_schedule = _weekly_schedule_payload(request.data or {})
    profile.weekly_schedule = weekly_schedule
    profile.available_days = list(weekly_schedule.keys())
    if weekly_schedule:
        first_window = next(iter(weekly_schedule.values()))[0]
        profile.working_hours_start = first_window["start"]
        profile.working_hours_end = first_window["end"]
    profile.save(update_fields=["weekly_schedule", "available_days", "working_hours_start", "working_hours_end"])
    return Response(user_to_out(doctor))


@api_view(["POST"])
@permission_classes([AllowAny])
def auth_password_reset(request):
    email = (request.data.get("email") or "").strip().lower()
    if not email:
        return Response({"detail": "Email is required."}, status=status.HTTP_400_BAD_REQUEST)
    return Response({"ok": True})


@api_view(["GET", "POST"])
@permission_classes([AllowAny])
def departments(request):
    if request.method == "GET":
        rows = Department.objects.order_by("name")
        return Response(DepartmentSerializer(rows, many=True).data)

    if not request.user.is_authenticated or getattr(getattr(request.user, "profile", None), "role", None) != UserRole.ADMIN:
        return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

    ser = DepartmentSerializer(data=request.data)
    ser.is_valid(raise_exception=True)
    obj = Department.objects.create(**ser.validated_data)
    return Response({"id": str(obj.id)}, status=status.HTTP_201_CREATED)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated, IsAdmin])
def department_detail(request, pk: int):
    obj = get_object_or_404(Department, pk=pk)
    if request.method == "DELETE":
        obj.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    ser = DepartmentSerializer(obj, data=request.data, partial=True)
    ser.is_valid(raise_exception=True)
    ser.save()
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["GET"])
@permission_classes([AllowAny])
def doctors(request):
    qs = User.objects.filter(profile__role=UserRole.DOCTOR).select_related("profile").order_by("profile__name", "username")
    return Response([user_to_out(u) for u in qs])


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def appointments(request):
    user = request.user
    role = getattr(getattr(user, "profile", None), "role", None)

    if request.method == "POST":
        if role != UserRole.PATIENT:
            return Response({"detail": "Only patients can create appointments."}, status=status.HTTP_403_FORBIDDEN)
        ser = AppointmentSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        doctor_id = int(ser.validated_data["doctor_id"])
        doctor = User.objects.get(pk=doctor_id)
        obj = Appointment.objects.create(
            patient=user,
            doctor=doctor,
            patient_name=ser.validated_data.get("patient_name", user_to_out(user)["name"]),
            doctor_name=ser.validated_data.get("doctor_name", user_to_out(doctor)["name"]),
            department=ser.validated_data.get("department", ""),
            date=ser.validated_data["date"],
            time=ser.validated_data["time"],
            fee=ser.validated_data.get("fee", 0),
            status=ser.validated_data.get("status", Appointment.Status.UPCOMING),
            payment_id=ser.validated_data.get("payment_id", ""),
        )
        return Response({"id": str(obj.id)}, status=status.HTTP_201_CREATED)

    doctor_id = request.query_params.get("doctor_id")
    patient_id = request.query_params.get("patient_id")
    date_str = request.query_params.get("date")

    qs = Appointment.objects.all().order_by("-created_at")
    if role == UserRole.PATIENT:
        qs = qs.filter(patient=user)
    elif role == UserRole.DOCTOR:
        qs = qs.filter(doctor=user)

    if doctor_id:
        qs = qs.filter(doctor_id=int(doctor_id))
    if patient_id:
        qs = qs.filter(patient_id=int(patient_id))
    if date_str:
        qs = qs.filter(date=date_str)

    return Response(AppointmentSerializer(qs, many=True).data)


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def appointment_detail(request, pk: int):
    appointment = get_object_or_404(Appointment, pk=pk)
    role = getattr(getattr(request.user, "profile", None), "role", None)
    next_status = str(request.data.get("status") or "").strip()

    can_update = (
        role in {UserRole.ADMIN, UserRole.COUNTER}
        or (role == UserRole.DOCTOR and appointment.doctor_id == request.user.id)
        or (
            role == UserRole.PATIENT
            and appointment.patient_id == request.user.id
            and appointment.status == Appointment.Status.UPCOMING
            and next_status == Appointment.Status.CANCELLED
        )
    )
    if not can_update:
        return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

    allowed_statuses = {choice for choice, _ in Appointment.Status.choices}
    if next_status not in allowed_statuses:
        return Response({"detail": "Valid appointment status is required."}, status=status.HTTP_400_BAD_REQUEST)
    if role == UserRole.PATIENT and next_status != Appointment.Status.CANCELLED:
        return Response({"detail": "Patients can only cancel their own upcoming appointments."}, status=status.HTTP_403_FORBIDDEN)
    if next_status == Appointment.Status.CANCELLED and appointment.status == Appointment.Status.COMPLETED:
        return Response({"detail": "Completed appointments cannot be cancelled."}, status=status.HTTP_400_BAD_REQUEST)

    appointment.status = next_status
    update_fields = ["status", "updated_at"]

    if next_status == Appointment.Status.CANCELLED:
        gateway_details = appointment.gateway_details if isinstance(appointment.gateway_details, dict) else {}
        if appointment.payment_status == "Confirmed" and appointment.payment_id:
            key_id = os.getenv("RAZORPAY_KEY_ID")
            key_secret = os.getenv("RAZORPAY_KEY_SECRET")
            refund_amount = appointment.total_amount_paise or (appointment.fee * 100)
            if key_id and key_secret:
                try:
                    import razorpay

                    client = razorpay.Client(auth=(key_id, key_secret))
                    refund = client.payment.refund(
                        appointment.payment_id,
                        {
                            "amount": refund_amount,
                            "speed": "normal",
                            "notes": {"appointmentId": str(appointment.id), "patientId": str(appointment.patient_id)},
                        },
                    )
                    appointment.payment_status = "Refund Initiated"
                    gateway_details["refund"] = refund
                except Exception as exc:
                    appointment.payment_status = "Refund Pending"
                    gateway_details["refundError"] = str(exc)
            else:
                appointment.payment_status = "Refund Pending"
            appointment.gateway_details = gateway_details
            update_fields.extend(["payment_status", "gateway_details"])
        elif appointment.payment_status in {"Pending", "Pay at Counter", "Failed", ""}:
            appointment.payment_status = "No Refund Needed"
            update_fields.append("payment_status")

    appointment.save(update_fields=update_fields)
    return Response(AppointmentSerializer(appointment).data)


@api_view(["GET", "PUT"])
@permission_classes([IsAuthenticated])
def availability(request):
    if request.method == "GET":
        doctor_id = request.query_params.get("doctor_id")
        date_str = request.query_params.get("date")
        if not doctor_id or not date_str:
            return Response({"detail": "doctor_id and date are required."}, status=status.HTTP_400_BAD_REQUEST)
        obj = DoctorAvailability.objects.filter(doctor_id=int(doctor_id), date=date_str).first()
        return Response({"slots": obj.slots if obj else []})

    ser = AvailabilitySerializer(data=request.data)
    ser.is_valid(raise_exception=True)
    doctor_id = int(ser.validated_data["doctorId"])
    date_val: date_type = ser.validated_data["date"]

    role = getattr(getattr(request.user, "profile", None), "role", None)
    if role not in {UserRole.ADMIN, UserRole.DOCTOR}:
        return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
    if role == UserRole.DOCTOR and request.user.id != doctor_id:
        return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

    obj, _ = DoctorAvailability.objects.update_or_create(
        doctor_id=doctor_id, date=date_val, defaults={"slots": ser.validated_data["slots"]}
    )
    return Response({"ok": True})


@api_view(["GET", "POST"])
@permission_classes([AllowAny])
def feedback(request):
    if request.method == "GET":
        approved = request.query_params.get("approved") == "true"
        qs = Feedback.objects.filter(approved=True) if approved else Feedback.objects.all()
        qs = qs.order_by("-created_at")
        out = [
            {
                "id": str(f.id),
                "patientName": f.patient_name,
                "rating": f.rating,
                "comment": f.comment,
                "date": f.created_at.astimezone().date().isoformat(),
            }
            for f in qs
        ]
        return Response(out)

    if not request.user.is_authenticated:
        return Response({"detail": "Authentication required."}, status=status.HTTP_401_UNAUTHORIZED)
    role = getattr(getattr(request.user, "profile", None), "role", None)
    if role != UserRole.PATIENT:
        return Response({"detail": "Only patients can submit feedback."}, status=status.HTTP_403_FORBIDDEN)

    patient_name = request.data.get("patientName") or user_to_out(request.user)["name"]
    patient_email = request.data.get("patientEmail") or request.user.email or request.user.username
    rating = int(request.data.get("rating") or 5)
    comment = (request.data.get("comment") or "").strip()
    if not comment:
        return Response({"detail": "Comment is required."}, status=status.HTTP_400_BAD_REQUEST)
    obj = Feedback.objects.create(
        patient=request.user, patient_name=patient_name, patient_email=patient_email, rating=rating, comment=comment
    )
    return Response({"id": str(obj.id)}, status=status.HTTP_201_CREATED)


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated, IsCounter])
def registrations(request):
    if request.method == "GET":
        rows = LabRegistration.objects.order_by("-created_at")[:200]
        return Response(LabRegistrationSerializer(rows, many=True).data)

    name = (request.data.get("name") or "").strip()
    age = int(request.data.get("age") or 0)
    fee = int(request.data.get("fee") or 200)
    if not name or age <= 0:
        return Response({"detail": "Valid name and age are required."}, status=status.HTTP_400_BAD_REQUEST)
    obj = LabRegistration.objects.create(name=name, age=age, fee=fee)
    return Response({"id": str(obj.id)}, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAdmin])
def admin_create_doctor(request):
    payload = request.data or {}
    name = (payload.get("name") or "").strip()
    email = (payload.get("email") or "").strip().lower()
    password = payload.get("password") or ""
    department = (payload.get("department") or "").strip()
    specialty = (payload.get("specialty") or "").strip()
    experience = (payload.get("experience") or "").strip()
    fee = int(payload.get("fee") or 0)
    available_days = payload.get("availableDays") or []
    working_hours = payload.get("workingHours") or {}
    start = working_hours.get("start") or "09:00"
    end = working_hours.get("end") or "17:00"
    common_profile = _common_profile_payload(payload)
    spiritual_profile, spiritual_error = _spiritual_profile_payload(payload)
    if spiritual_error:
        return Response({"detail": spiritual_error}, status=status.HTTP_400_BAD_REQUEST)
    weekly_schedule = _weekly_schedule_payload(payload) or {
        day: [{"start": start, "end": end}]
        for day in available_days
    }
    salary = int(payload.get("salary") or 0)

    if not (name and email and password and department and specialty and experience and fee > 0 and common_profile["phone_no"]):
        return Response({"detail": "Missing required doctor fields."}, status=status.HTTP_400_BAD_REQUEST)
    if User.objects.filter(username=email).exists():
        return Response({"detail": "Doctor email already exists."}, status=status.HTTP_400_BAD_REQUEST)

    user = User.objects.create_user(username=email, email=email, password=password, first_name=name)
    UserProfile.objects.create(
        user=user,
        role=UserRole.DOCTOR,
        name=name,
        department=department,
        specialty=specialty,
        experience=experience,
        fee=fee,
        salary=salary if salary > 0 else None,
        available_days=available_days,
        working_hours_start=start,
        working_hours_end=end,
        weekly_schedule=weekly_schedule,
        **common_profile,
        **spiritual_profile,
    )
    return Response({"uid": str(user.id), "email": email}, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAdmin])
def admin_create_staff(request):
    payload = request.data or {}
    role = str(payload.get("role") or "").strip().upper()
    name = (payload.get("name") or "").strip()
    email = (payload.get("email") or "").strip().lower()
    password = payload.get("password") or ""
    common_profile = _common_profile_payload(payload)
    spiritual_profile, spiritual_error = _spiritual_profile_payload(payload)
    if spiritual_error:
        return Response({"detail": spiritual_error}, status=status.HTTP_400_BAD_REQUEST)
    staff_type = str(payload.get("staffType") or "").strip()
    salary = int(payload.get("salary") or 0)

    if role not in {UserRole.ADMIN, UserRole.COUNTER, UserRole.STAFF}:
        return Response({"detail": "Staff role must be ADMIN, COUNTER, or STAFF."}, status=status.HTTP_400_BAD_REQUEST)
    if not (name and email and password and common_profile["phone_no"]):
        return Response({"detail": "Name, email, password, and phone number are required."}, status=status.HTTP_400_BAD_REQUEST)
    if User.objects.filter(username=email).exists():
        return Response({"detail": "Staff email already exists."}, status=status.HTTP_400_BAD_REQUEST)

    user = User.objects.create_user(username=email, email=email, password=password, first_name=name)
    UserProfile.objects.create(
        user=user,
        role=role,
        name=name,
        staff_type=staff_type,
        salary=salary if salary > 0 else None,
        **common_profile,
        **spiritual_profile,
    )
    return Response({"uid": str(user.id), "email": email, "role": role}, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([AllowAny])
def contact(request):
    name = (request.data.get("name") or "").strip()
    email = (request.data.get("email") or "").strip()
    subject = (request.data.get("subject") or "General Inquiry").strip()
    message = (request.data.get("message") or "").strip()
    if not (name and email and message):
        return Response({"detail": "name, email, and message are required."}, status=status.HTTP_400_BAD_REQUEST)

    api_key = os.getenv("SENDGRID_API_KEY", "").strip()
    from_email = _sendgrid_from_email()
    to_email = os.getenv("CLINIC_TO_EMAIL", "").strip() or "yourclinic-inbox@example.com"
    if not api_key:
        return Response({"status": "success", "message": "Message accepted (SendGrid not configured)."})
    if not from_email:
        return Response({"detail": "SENDGRID_FROM_EMAIL is not configured."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    mail = Mail(
        from_email=from_email,
        to_emails=to_email,
        subject=f"[BHCC] {subject}",
        html_content=f"<p><strong>From:</strong> {name} ({email})</p><p>{message}</p>",
    )
    try:
        SendGridAPIClient(api_key).send(mail)
    except Exception as exc:
        return Response({"detail": f"Failed to send email: {exc}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    return Response({"status": "success", "message": "Your message has been sent successfully!"})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def payments_create_order(request):
    user = request.user
    role = getattr(getattr(user, "profile", None), "role", None)
    if role != UserRole.PATIENT:
        return Response({"detail": "Only patients can create orders."}, status=status.HTTP_403_FORBIDDEN)

    appointment_data = request.data.get("appointmentData") or {}
    fee = int(appointment_data.get("fee") or 0)
    if fee <= 0:
        return Response({"detail": "Valid fee is required."}, status=status.HTTP_400_BAD_REQUEST)

    gateway_fee = int((fee * 0.02) + 0.9999)
    final_amount = fee + gateway_fee

    doctor_id = int(appointment_data.get("doctorId") or 0)
    if doctor_id <= 0:
        return Response({"detail": "doctorId is required."}, status=status.HTTP_400_BAD_REQUEST)
    doctor = User.objects.get(pk=doctor_id)

    try:
        appt_date = date_type.fromisoformat(str(appointment_data.get("date") or ""))
    except ValueError:
        return Response({"detail": "Invalid date. Use YYYY-MM-DD."}, status=status.HTTP_400_BAD_REQUEST)

    appt_time = str(appointment_data.get("time") or "").strip()
    if not appt_time:
        return Response({"detail": "time is required."}, status=status.HTTP_400_BAD_REQUEST)

    appt = Appointment.objects.create(
        patient=user,
        doctor=doctor,
        patient_name=appointment_data.get("patientName") or user_to_out(user)["name"],
        doctor_name=appointment_data.get("doctorName") or user_to_out(doctor)["name"],
        department=appointment_data.get("department") or "",
        date=appt_date,
        time=appt_time,
        fee=fee,
        status=Appointment.Status.UPCOMING,
        payment_status="Pending",
        order_id="",
        gateway_fee=gateway_fee,
        total_amount=final_amount,
        total_amount_paise=final_amount * 100,
    )

    key_id = os.getenv("RAZORPAY_KEY_ID")
    key_secret = os.getenv("RAZORPAY_KEY_SECRET")
    if not key_id or not key_secret:
        appt.payment_status = "Pay at Counter"
        appt.order_id = str(appt.id)
        appt.gateway_fee = 0
        appt.total_amount = fee
        appt.total_amount_paise = fee * 100
        appt.save(update_fields=["payment_status", "order_id", "gateway_fee", "total_amount", "total_amount_paise", "updated_at"])
        return Response(
            {
                "orderId": str(appt.id),
                "gatewayOrderId": "",
                "amount": fee,
                "amountPaise": fee * 100,
                "currency": "INR",
                "offlinePayment": True,
                "message": "Payment gateway is not configured. Appointment booked for counter payment.",
            }
        )

    import razorpay

    client = razorpay.Client(auth=(key_id, key_secret))
    try:
        gateway_order = client.order.create(
            {
                "amount": final_amount * 100,
                "currency": "INR",
                "receipt": str(appt.id),
                "notes": {"appointmentId": str(appt.id), "patientId": str(user.id)},
            }
        )
    except Exception:
        appt.payment_status = "Failed"
        appt.status = Appointment.Status.CANCELLED
        appt.save(update_fields=["payment_status", "status", "updated_at"])
        return Response({"detail": "Could not create payment order."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    appt.order_id = str(appt.id)
    appt.gateway_order_id = gateway_order.get("id", "")
    appt.save(update_fields=["order_id", "gateway_order_id", "updated_at"])

    return Response(
        {
            "orderId": str(appt.id),
            "gatewayOrderId": appt.gateway_order_id,
            "amount": final_amount,
            "amountPaise": final_amount * 100,
            "currency": "INR",
        }
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def payments_verify(request):
    user = request.user
    order_id = request.data.get("orderId")
    payment_success = bool(request.data.get("paymentSuccess"))
    gateway_response = request.data.get("gatewayResponse") or {}

    if not order_id:
        return Response({"detail": "orderId is required."}, status=status.HTTP_400_BAD_REQUEST)

    appt = Appointment.objects.filter(pk=int(order_id)).first()
    if not appt:
        return Response({"detail": "Order not found."}, status=status.HTTP_404_NOT_FOUND)
    if appt.patient_id != user.id:
        return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

    if payment_success:
        rzp_payment_id = gateway_response.get("razorpay_payment_id")
        rzp_order_id = gateway_response.get("razorpay_order_id")
        rzp_signature = gateway_response.get("razorpay_signature")
        key_secret = os.getenv("RAZORPAY_KEY_SECRET")
        if not (rzp_payment_id and rzp_order_id and rzp_signature and key_secret):
            return Response({"detail": "Missing signature fields."}, status=status.HTTP_400_BAD_REQUEST)
        if appt.gateway_order_id and appt.gateway_order_id != rzp_order_id:
            return Response({"detail": "Gateway order mismatch."}, status=status.HTTP_400_BAD_REQUEST)

        payload = f"{rzp_order_id}|{rzp_payment_id}".encode()
        expected = hmac.new(key_secret.encode(), payload, digestmod="sha256").hexdigest()
        if expected != rzp_signature:
            return Response({"detail": "Invalid signature."}, status=status.HTTP_403_FORBIDDEN)

        appt.payment_status = "Confirmed"
        appt.status = Appointment.Status.UPCOMING
        appt.payment_id = rzp_payment_id
        appt.gateway_details = gateway_response
        appt.save(update_fields=["payment_status", "status", "payment_id", "gateway_details", "updated_at"])
        return Response({"status": "success", "message": "Payment verified and appointment confirmed."})

    appt.payment_status = "Failed"
    appt.status = Appointment.Status.CANCELLED
    appt.gateway_details = gateway_response
    appt.save(update_fields=["payment_status", "status", "gateway_details", "updated_at"])
    return Response({"status": "failed", "message": "Payment failed or was cancelled."}, status=status.HTTP_400_BAD_REQUEST)
