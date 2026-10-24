from __future__ import annotations
import hmac
import logging
import os
import secrets
from datetime import date as date_type, timedelta

from django.contrib.auth import authenticate, password_validation
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.contrib.auth.models import User
from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.models.deletion import ProtectedError
from django.db.models import Count, Q, Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken

from .email_service import (
    schedule_appointment_confirmation,
    send_admin_notification,
    send_contact_notification,
    send_password_changed_email,
    send_password_reset_email,
    send_staff_login_otp,
    send_verification_email,
)
from .models import AdminAuditLog, Appointment, AppointmentProcedure, CampRegistration, ConsentRecord, Department, DoctorAvailability, EmailOTP, Feedback, FreeCamp, LabRegistration, PayrollRecord, UserProfile, UserRole, allocate_patient_id
from .operational_views import client_ip, record_admin_action
from .permissions import IsAdmin, IsCounter
from .serializers import (
    AppointmentSerializer,
    DepartmentSerializer,
    LabRegistrationSerializer,
    PayrollRecordSerializer,
    AvailabilitySerializer,
    user_to_out,
    public_doctor_to_out,
)


BOOK_STATUS_VALUES = {"Yet to Start", "Just Started", "Ongoing", "Completed"}
INCOME_RANGE_VALUES = {"Less than 1 lakh", "1-5 Lakhs", "Greater than 5 Lakhs"}
SPIRITUAL_FIELD_DISABLED_RELIGIONS = {"muslim", "christian"}
STAFF_ROLES = {UserRole.DOCTOR, UserRole.ADMIN, UserRole.COUNTER, UserRole.STAFF}
logger = logging.getLogger(__name__)
WEEK_DAYS = {"Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"}
POLICY_VERSION = "2026-08-07"


def _next_appointment_token(department_name: str, appointment_date: date_type) -> tuple[int, str]:
    department = Department.objects.select_for_update().filter(name__iexact=department_name).first()
    last = Appointment.objects.filter(
        department__iexact=department_name, date=appointment_date, department_sequence__isnull=False
    ).order_by("-department_sequence").first()
    sequence = (last.department_sequence if last else 0) + 1
    prefix = (department.token_prefix if department else "") or "".join(
        word[0] for word in department_name.split() if word
    )[:4] or "DEPT"
    return sequence, f"{prefix.upper()}-{sequence:03d}"


def _follow_up_error(original: Appointment, patient: User, doctor: User, appointment_date: date_type) -> str | None:
    if original.patient_id != patient.id or original.doctor_id != doctor.id:
        return "The free follow-up must be for the same patient and doctor."
    if original.status != Appointment.Status.COMPLETED or original.payment_status != "Confirmed" or original.fee <= 0:
        return "Only a completed, paid consultation qualifies for a free follow-up."
    expiry_date = original.date + timedelta(days=14)
    if appointment_date < original.date or appointment_date > expiry_date or timezone.localdate() > expiry_date:
        return "The fourteen-day free follow-up period has expired."
    if original.follow_ups.exclude(
        status__in=[Appointment.Status.CANCELLED, Appointment.Status.NO_SHOW, Appointment.Status.RESCHEDULED]
    ).exists():
        return "The free follow-up for this consultation has already been used."
    return None


def _consultation_financials(request, role: str | None, base_fee: int, is_free: bool = False):
    if is_free:
        return {"base_fee": 0, "percent": 0, "amount": 0, "final_fee": 0, "reason": "", "share": 0}, None
    try:
        percent = int(request.data.get("concessionPercent") or 0)
    except (TypeError, ValueError):
        return None, Response({"detail": "Concession percentage must be a whole number."}, status=status.HTTP_400_BAD_REQUEST)
    reason = str(request.data.get("concessionReason") or "").strip()
    maximum = 100 if role in {UserRole.COUNTER, UserRole.ADMIN} else 0
    if not 0 <= percent <= maximum:
        return None, Response({"detail": f"This account may grant a concession between 0% and {maximum}%."}, status=status.HTTP_403_FORBIDDEN)
    if percent and len(reason) < 3:
        return None, Response({"detail": "A concession reason is required."}, status=status.HTTP_400_BAD_REQUEST)
    amount = (base_fee * percent) // 100
    final_fee = base_fee - amount
    return {"base_fee": base_fee, "percent": percent, "amount": amount, "final_fee": final_fee, "reason": reason, "share": final_fee // 2}, None


def _record_policy_consents(request, user: User) -> None:
    for document_type in ("PRIVACY", "TERMS"):
        ConsentRecord.objects.get_or_create(
            user=user,
            document_type=document_type,
            document_version=POLICY_VERSION,
            defaults={"ip_address": client_ip(request), "user_agent": request.META.get("HTTP_USER_AGENT", "")[:500]},
        )


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


def _avatar_payload(payload: dict) -> tuple[str | None, str | None]:
    if "avatar" not in payload:
        return None, None
    avatar = str(payload.get("avatar") or "").strip()
    if not avatar:
        return "", None
    allowed_prefixes = ("data:image/jpeg;base64,", "data:image/png;base64,", "data:image/webp;base64,")
    if not avatar.startswith(allowed_prefixes):
        return None, "Profile photo must be a JPEG, PNG, or WebP image."
    if len(avatar) > 700_000:
        return None, "Profile photo is too large. Please choose an image smaller than 500 KB."
    return avatar, None


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
    profile = getattr(user, "profile", None)
    recipient_name = getattr(profile, "name", "") or user.get_full_name() or "Staff member"
    return send_staff_login_otp(
        recipient=user.email or user.username,
        recipient_name=recipient_name,
        code=code,
    ).delivered


def _security_link(path: str, user: User) -> str:
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    return f"{settings.FRONTEND_URL}/{path}?uid={uid}&token={token}"


def _send_patient_verification(user: User, profile: UserProfile) -> bool:
    delivered = send_verification_email(recipient=user.email, recipient_name=profile.name, verification_url=_security_link("verify-email", user)).delivered
    if delivered:
        profile.verification_sent_at = timezone.now()
        profile.save(update_fields=["verification_sent_at"])
    return delivered


def _user_from_token(uid: str, token: str) -> User | None:
    try:
        user = User.objects.select_related("profile").get(pk=force_str(urlsafe_base64_decode(uid)))
    except (TypeError, ValueError, OverflowError, User.DoesNotExist):
        return None
    return user if default_token_generator.check_token(user, token) else None


@api_view(["POST"])
@permission_classes([AllowAny])
def auth_login(request):
    identifier = (request.data.get("email") or request.data.get("identifier") or "").strip()
    password = request.data.get("password") or ""

    if not identifier or not password:
        return Response({"detail": "Email or patient ID and password are required."}, status=status.HTTP_400_BAD_REQUEST)

    username = identifier.lower()
    if identifier.upper().startswith("BHCC"):
        profile = UserProfile.objects.filter(patient_id=identifier.upper(), role=UserRole.PATIENT).select_related("user").first()
        username = profile.user.username if profile else identifier.lower()

    user = authenticate(request, username=username, password=password)
    if not user:
        return Response({"detail": "Invalid credentials."}, status=status.HTTP_401_UNAUTHORIZED)

    _ensure_profile(user)

    data = _token_pair(user)
    data["user"] = user_to_out(user)
    return Response(data)


@api_view(["POST"])
@permission_classes([AllowAny])
def auth_google(request):
    credential = str(request.data.get("credential") or "").strip()
    if not settings.GOOGLE_CLIENT_ID:
        return Response({"detail": "Google patient login is not configured."}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    if not credential:
        return Response({"detail": "Google credential is required."}, status=status.HTTP_400_BAD_REQUEST)

    try:
        from google.auth.transport import requests as google_requests
        from google.oauth2 import id_token
        claims = id_token.verify_oauth2_token(credential, google_requests.Request(), settings.GOOGLE_CLIENT_ID)
    except (ValueError, TypeError):
        return Response({"detail": "Google authentication could not be verified."}, status=status.HTTP_401_UNAUTHORIZED)

    email = str(claims.get("email") or "").strip().lower()
    name = str(claims.get("name") or "").strip() or email.split("@", 1)[0]
    if not email or claims.get("email_verified") is not True:
        return Response({"detail": "A verified Google email address is required."}, status=status.HTTP_401_UNAUTHORIZED)

    with transaction.atomic():
        user = User.objects.select_for_update().filter(Q(username__iexact=email) | Q(email__iexact=email)).select_related("profile").first()
        if user:
            profile = _ensure_profile(user)
            if profile.role != UserRole.PATIENT:
                return Response({"detail": "This Google email belongs to a staff account. Please use Staff Login."}, status=status.HTTP_403_FORBIDDEN)
            user_fields = []
            if not user.is_active:
                user.is_active = True
                user_fields.append("is_active")
            if not user.email:
                user.email = email
                user_fields.append("email")
            if user_fields:
                user.save(update_fields=user_fields)
            profile_fields = []
            if not profile.name:
                profile.name = name
                profile_fields.append("name")
            if not profile.email_verified_at:
                profile.email_verified_at = timezone.now()
                profile_fields.append("email_verified_at")
            if profile_fields:
                profile.save(update_fields=profile_fields)
        else:
            if not _truthy(request.data.get("acceptPolicies")):
                return Response({"detail": "You must accept the Privacy Policy and Terms to create an account."}, status=status.HTTP_400_BAD_REQUEST)
            user = User.objects.create_user(username=email, email=email, first_name=name)
            user.set_unusable_password()
            user.save(update_fields=["password"])
            profile = UserProfile.objects.create(user=user, role=UserRole.PATIENT, name=name, email_verified_at=timezone.now())
            _record_policy_consents(request, user)
        allocate_patient_id(profile)

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
    if not _truthy(request.data.get("acceptPolicies")):
        return Response({"detail": "You must accept the Privacy Policy and Terms to create an account."}, status=status.HTTP_400_BAD_REQUEST)
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
    try:
        password_validation.validate_password(password)
    except ValidationError as exc:
        return Response({"detail": " ".join(exc.messages)}, status=status.HTTP_400_BAD_REQUEST)

    normalized_phone = "".join(ch for ch in profile_data["phone_no"] if ch.isdigit())[-10:]
    normalized_name = " ".join(name.casefold().split())
    existing_profile = UserProfile.objects.filter(role=UserRole.PATIENT, phone_no__endswith=normalized_phone).select_related("user").first()
    if existing_profile and " ".join(existing_profile.name.casefold().split()) != normalized_name:
        return Response({"detail": "This mobile number is already associated with another patient. Please ask the clinic counter to link the correct patient record."}, status=status.HTTP_409_CONFLICT)
    if existing_profile and existing_profile.user.has_usable_password():
        return Response({"detail": "A patient account already exists for this mobile number. Please sign in or reset the password."}, status=status.HTTP_409_CONFLICT)

    if existing_profile:
        user = existing_profile.user
        user.username = email
        user.email = email
        user.first_name = name
        user.is_active = False
        user.set_password(password)
        user.save()
        profile = existing_profile
        for field, value in profile_data.items():
            setattr(profile, field, value)
        profile.name = name
        profile.save()
    else:
        user = User.objects.create_user(username=email, email=email, password=password, first_name=name, is_active=False)
        profile = UserProfile.objects.create(user=user, role=UserRole.PATIENT, name=name, **profile_data)
    _record_policy_consents(request, user)
    allocate_patient_id(profile)
    _send_patient_verification(user, profile)
    return Response({"verificationRequired": True, "email": email, "detail": "Account created. Check your email to verify it before signing in."}, status=status.HTTP_201_CREATED)


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
    avatar, avatar_error = _avatar_payload(payload)
    if avatar_error:
        return Response({"detail": avatar_error}, status=status.HTTP_400_BAD_REQUEST)
    profile_data, profile_error = _patient_profile_payload(payload)
    if profile_error:
        return Response({"detail": profile_error}, status=status.HTTP_400_BAD_REQUEST)

    name = str(payload.get("name") or "").strip()
    if name:
        profile.name = name
        request.user.first_name = name

    for field, value in profile_data.items():
        setattr(profile, field, value)
    if avatar is not None:
        profile.avatar_data_url = avatar

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
    avatar, avatar_error = _avatar_payload(payload)
    if avatar_error:
        return Response({"detail": avatar_error}, status=status.HTTP_400_BAD_REQUEST)
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
    if avatar is not None:
        profile.avatar_data_url = avatar

    if profile.role == UserRole.DOCTOR:
        profile.department = str(payload.get("department") or "").strip()
        profile.specialty = str(payload.get("specialty") or "").strip()
        profile.experience = str(payload.get("experience") or "").strip()
        profile.medical_registration_number = str(payload.get("medicalRegistrationNumber") or "").strip()
        profile.registration_council = str(payload.get("registrationCouncil") or "").strip()
        profile.qualification = str(payload.get("qualification") or "").strip()
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
    user = User.objects.filter(username=email, is_active=True).select_related("profile").first()
    if user:
        profile = _ensure_profile(user)
        cooldown_elapsed = not profile.password_reset_sent_at or profile.password_reset_sent_at <= timezone.now() - timedelta(seconds=settings.PASSWORD_RESET_COOLDOWN_SECONDS)
        if cooldown_elapsed:
            delivered = send_password_reset_email(recipient=user.email or user.username, recipient_name=profile.name, reset_url=_security_link("reset-password", user)).delivered
            if delivered:
                profile.password_reset_sent_at = timezone.now()
                profile.save(update_fields=["password_reset_sent_at"])
    return Response({"ok": True, "detail": "If an account exists for this email, a reset link has been sent."})


@api_view(["POST"])
@permission_classes([AllowAny])
def auth_verify_email(request):
    user = _user_from_token(str(request.data.get("uid") or ""), str(request.data.get("token") or ""))
    if not user:
        return Response({"detail": "This verification link is invalid or expired."}, status=status.HTTP_400_BAD_REQUEST)
    profile = _ensure_profile(user)
    if profile.email_verified_at:
        return Response({"detail": "This verification link has already been used."}, status=status.HTTP_400_BAD_REQUEST)
    profile.email_verified_at = timezone.now()
    user.is_active = True
    user.save(update_fields=["is_active"])
    profile.save(update_fields=["email_verified_at"])
    return Response({"ok": True})


@api_view(["POST"])
@permission_classes([AllowAny])
def auth_resend_verification(request):
    email = str(request.data.get("email") or "").strip().lower()
    user = User.objects.filter(username=email, is_active=False, profile__role=UserRole.PATIENT).select_related("profile").first()
    if user and (not user.profile.verification_sent_at or user.profile.verification_sent_at <= timezone.now() - timedelta(seconds=settings.EMAIL_VERIFICATION_COOLDOWN_SECONDS)):
        _send_patient_verification(user, user.profile)
    return Response({"ok": True, "detail": "If an unverified account exists, a verification email has been sent."})


@api_view(["POST"])
@permission_classes([AllowAny])
def auth_password_reset_confirm(request):
    user = _user_from_token(str(request.data.get("uid") or ""), str(request.data.get("token") or ""))
    if not user:
        return Response({"detail": "This reset link is invalid or expired."}, status=status.HTTP_400_BAD_REQUEST)
    new_password = str(request.data.get("password") or "")
    try:
        password_validation.validate_password(new_password, user)
    except ValidationError as exc:
        return Response({"detail": " ".join(exc.messages)}, status=status.HTTP_400_BAD_REQUEST)
    user.set_password(new_password)
    user.save(update_fields=["password"])
    send_password_changed_email(recipient=user.email or user.username, recipient_name=getattr(getattr(user, "profile", None), "name", ""))
    return Response({"ok": True})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def auth_change_password(request):
    if not request.user.check_password(str(request.data.get("currentPassword") or "")):
        return Response({"detail": "Current password is incorrect."}, status=status.HTTP_400_BAD_REQUEST)
    new_password = str(request.data.get("newPassword") or "")
    try:
        password_validation.validate_password(new_password, request.user)
    except ValidationError as exc:
        return Response({"detail": " ".join(exc.messages)}, status=status.HTTP_400_BAD_REQUEST)
    request.user.set_password(new_password)
    request.user.save(update_fields=["password"])
    send_password_changed_email(recipient=request.user.email or request.user.username, recipient_name=getattr(request.user.profile, "name", ""))
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
    return Response([public_doctor_to_out(u) for u in qs])


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsAdmin])
def admin_dashboard(request):
    today = timezone.localdate()
    inactive_statuses = [Appointment.Status.CANCELLED, Appointment.Status.NO_SHOW, Appointment.Status.RESCHEDULED]
    current_week_start = today - timedelta(days=6)
    previous_week_start = today - timedelta(days=13)
    previous_week_end = current_week_start - timedelta(days=1)

    current_week_appointments = Appointment.objects.filter(
        date__range=(current_week_start, today)
    ).exclude(status__in=inactive_statuses).count()
    previous_week_appointments = Appointment.objects.filter(
        date__range=(previous_week_start, previous_week_end)
    ).exclude(status__in=inactive_statuses).count()
    if previous_week_appointments:
        weekly_growth = round(
            ((current_week_appointments - previous_week_appointments) / previous_week_appointments) * 100,
            1,
        )
    else:
        weekly_growth = 100.0 if current_week_appointments else 0.0

    confirmed_payments = Appointment.objects.exclude(payment_status__in=["Refunded", "Transferred"])
    cash_revenue = confirmed_payments.filter(payment_method="CASH").aggregate(total=Sum("collected_amount"))["total"] or 0
    online_revenue = confirmed_payments.filter(
        Q(payment_method__in=["RAZORPAY", "PAYTM_POS_MANUAL", "PAYTM_POS_AUTOMATIC"])
        | (Q(payment_method="") & ~Q(payment_id=""))
    ).aggregate(total=Sum("collected_amount"))["total"] or 0
    collected_revenue = confirmed_payments.aggregate(total=Sum("collected_amount"))["total"] or 0
    recent_appointments = Appointment.objects.select_related("patient", "doctor").order_by("-created_at")[:10]

    return Response(
        {
            "totalPatients": UserProfile.objects.filter(role=UserRole.PATIENT).count(),
            "appointmentsToday": Appointment.objects.filter(date=today).exclude(status__in=inactive_statuses).count(),
            "cancelledToday": Appointment.objects.filter(date=today, status=Appointment.Status.CANCELLED).count(),
            "refundsPending": Appointment.objects.filter(refund_status__in=["Pending", "Initiated"]).count(),
            "activeDoctors": UserProfile.objects.filter(
                role=UserRole.DOCTOR, user__is_active=True
            ).count(),
            "grossRevenue": collected_revenue,
            "procedureCharges": AppointmentProcedure.objects.exclude(appointment__status__in=inactive_statuses).aggregate(total=Sum("charge"))["total"] or 0,
            "totalBilled": Appointment.objects.exclude(status__in=inactive_statuses).aggregate(total=Sum("fee"))["total"] or 0,
            "cashRevenue": cash_revenue,
            "onlineRevenue": online_revenue,
            "currentWeekAppointments": current_week_appointments,
            "completedToday": Appointment.objects.filter(
                date=today, status=Appointment.Status.COMPLETED
            ).count(),
            "weeklyGrowthPercent": weekly_growth,
            "recentAppointments": AppointmentSerializer(recent_appointments, many=True).data,
            "updatedAt": timezone.now().isoformat(),
        }
    )


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def appointments(request):
    user = request.user
    role = getattr(getattr(user, "profile", None), "role", None)

    if request.method == "POST":
        if role not in {UserRole.PATIENT, UserRole.COUNTER, UserRole.ADMIN}:
            return Response({"detail": "Only patients, counter staff and administrators can create appointments."}, status=status.HTTP_403_FORBIDDEN)
        ser = AppointmentSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        doctor_id = int(ser.validated_data["doctor_id"])
        doctor = get_object_or_404(User.objects.select_related("profile"), pk=doctor_id, profile__role=UserRole.DOCTOR, is_active=True)
        patient = user
        if role in {UserRole.COUNTER, UserRole.ADMIN}:
            patient = get_object_or_404(User.objects.select_related("profile"), pk=request.data.get("patientId"), profile__role=UserRole.PATIENT)
        doctor_out = user_to_out(doctor)
        base_fee = int(doctor.profile.fee or 0)
        historical = bool(request.data.get("recordedAfterService", False))
        historical_reason = str(request.data.get("historicalEntryReason") or "").strip()
        if historical:
            if role not in {UserRole.COUNTER, UserRole.ADMIN}:
                return Response({"detail": "Only administrators and counter staff can record a past consultation."}, status=status.HTTP_403_FORBIDDEN)
            if ser.validated_data["date"] > timezone.localdate():
                return Response({"detail": "A past-consultation entry cannot use a future date."}, status=status.HTTP_400_BAD_REQUEST)
            if len(historical_reason) < 3:
                return Response({"detail": "Explain why this consultation is being entered after service."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            with transaction.atomic():
                follow_up = None
                follow_up_id = request.data.get("followUpOf")
                if follow_up_id:
                    follow_up = get_object_or_404(Appointment.objects.select_for_update(), pk=follow_up_id)
                    follow_up_error = _follow_up_error(follow_up, patient, doctor, ser.validated_data["date"])
                    if follow_up_error:
                        return Response({"detail": follow_up_error}, status=status.HTTP_409_CONFLICT)
                financials, financial_error = _consultation_financials(request, role, base_fee, bool(follow_up))
                if financial_error:
                    return financial_error
                sequence, token_number = _next_appointment_token(doctor.profile.department, ser.validated_data["date"])
                obj = Appointment.objects.create(
                    patient=patient,
                    doctor=doctor,
                    patient_name=user_to_out(patient)["name"],
                    doctor_name=doctor_out["name"],
                    department=doctor.profile.department,
                    date=ser.validated_data["date"],
                    time=ser.validated_data["time"],
                    fee=financials["final_fee"],
                    base_consultation_fee=financials["base_fee"],
                    concession_percent=financials["percent"],
                    concession_amount=financials["amount"],
                    concession_reason=financials["reason"],
                    concession_granted_by=request.user if financials["percent"] else None,
                    concession_granted_at=timezone.now() if financials["percent"] else None,
                    doctor_share_percent=50,
                    doctor_share_amount=financials["share"],
                    recorded_after_service=historical,
                    historical_entry_reason=historical_reason if historical else "",
                    historical_entry_by=request.user if historical else None,
                    historical_entry_at=timezone.now() if historical else None,
                    department_sequence=sequence,
                    token_number=token_number,
                    follow_up_of=follow_up,
                    status=Appointment.Status.COMPLETED if historical else Appointment.Status.UPCOMING,
                    payment_id=ser.validated_data.get("payment_id", ""),
                    payment_status="Free Follow-up" if follow_up else ("Pay at Counter" if role in {UserRole.COUNTER, UserRole.ADMIN} else "Pending"),
                    payment_method="FREE_FOLLOW_UP" if follow_up else "",
                )
        except IntegrityError:
            return Response({"detail": "This doctor appointment slot has already been booked. Please select another time."}, status=status.HTTP_409_CONFLICT)
        schedule_appointment_confirmation(obj.id)
        return Response({"id": str(obj.id), "isFreeFollowUp": bool(obj.follow_up_of_id)}, status=status.HTTP_201_CREATED)

    now = timezone.localtime()
    no_show_cutoff = now - timedelta(minutes=30)
    Appointment.objects.filter(status=Appointment.Status.UPCOMING).filter(
        Q(date__lt=no_show_cutoff.date()) | Q(date=no_show_cutoff.date(), time__lt=no_show_cutoff.strftime("%H:%M"))
    ).update(status=Appointment.Status.NO_SHOW, updated_at=timezone.now())

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
    role = getattr(getattr(request.user, "profile", None), "role", None)
    appointment = get_object_or_404(Appointment.objects.select_related("doctor__profile", "patient__profile"), pk=pk)
    action = str(request.data.get("action") or "").strip().lower()
    next_status = str(request.data.get("status") or "").strip()

    if action == "mark_consulted":
        if role not in {UserRole.ADMIN, UserRole.COUNTER, UserRole.DOCTOR} or (role == UserRole.DOCTOR and appointment.doctor_id != request.user.id):
            return Response({"detail": "You cannot confirm this consultation."}, status=status.HTTP_403_FORBIDDEN)
        if appointment.status in {Appointment.Status.CANCELLED, Appointment.Status.RESCHEDULED}:
            return Response({"detail": "Cancelled or rescheduled appointments cannot be marked as consulted."}, status=status.HTTP_409_CONFLICT)
        correction_reason = str(request.data.get("reason") or "").strip()
        if appointment.status == Appointment.Status.NO_SHOW and len(correction_reason) < 3:
            return Response({"detail": "Enter a correction reason for this no-show record."}, status=status.HTTP_400_BAD_REQUEST)
        appointment.status = Appointment.Status.COMPLETED
        appointment.save(update_fields=["status", "updated_at"])
        record_admin_action(request, action="CONSULTATION_CONFIRMED", target_type="APPOINTMENT", target_id=appointment.id, summary=f"Consultation marked completed. Reason: {correction_reason or 'Routine completion confirmation'}")
        return Response(AppointmentSerializer(appointment).data)

    if action == "reschedule":
        if role not in {UserRole.ADMIN, UserRole.COUNTER}:
            return Response({"detail": "Only administrators and counter staff can reschedule appointments."}, status=status.HTTP_403_FORBIDDEN)
        if appointment.status in {Appointment.Status.COMPLETED, Appointment.Status.CANCELLED, Appointment.Status.RESCHEDULED}:
            return Response({"detail": "Completed, cancelled or already-rescheduled appointments cannot be rescheduled."}, status=status.HTTP_409_CONFLICT)
        date_text = str(request.data.get("date") or "").strip()
        time_text = str(request.data.get("time") or "").strip()
        reason = str(request.data.get("reason") or "").strip()
        if len(reason) < 3:
            return Response({"detail": "Enter a short reason for rescheduling."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            new_date = date_type.fromisoformat(date_text)
        except ValueError:
            return Response({"detail": "Enter a valid reschedule date in YYYY-MM-DD format."}, status=status.HTTP_400_BAD_REQUEST)
        if new_date < timezone.localdate():
            return Response({"detail": "An appointment cannot be rescheduled to a past date."}, status=status.HTTP_400_BAD_REQUEST)
        if len(time_text) != 5 or time_text[2] != ":":
            return Response({"detail": "Enter a valid reschedule time in HH:MM format."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            reschedule_hour, reschedule_minute = map(int, time_text.split(":"))
        except ValueError:
            return Response({"detail": "Enter a valid reschedule time in HH:MM format."}, status=status.HTTP_400_BAD_REQUEST)
        if not (0 <= reschedule_hour <= 23 and 0 <= reschedule_minute <= 59):
            return Response({"detail": "Enter a valid reschedule time in HH:MM format."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            with transaction.atomic():
                locked = Appointment.objects.select_for_update().select_related("doctor__profile").get(pk=appointment.pk)
                original_payment_method = locked.payment_method
                original_payment_status = locked.payment_status
                locked.status = Appointment.Status.RESCHEDULED
                locked.payment_status = "Transferred"
                locked.payment_method = "TRANSFERRED"
                locked.reschedule_reason = reason
                locked.rescheduled_by = request.user
                locked.rescheduled_at = timezone.now()
                locked.save(update_fields=["status", "payment_status", "payment_method", "reschedule_reason", "rescheduled_by", "rescheduled_at", "updated_at"])
                sequence, token_number = _next_appointment_token(locked.department, new_date)
                replacement = Appointment.objects.create(
                    patient=locked.patient,
                    doctor=locked.doctor,
                    patient_name=locked.patient_name,
                    doctor_name=locked.doctor_name,
                    department=locked.department,
                    date=new_date,
                    time=time_text,
                    fee=locked.fee,
                    base_consultation_fee=locked.base_consultation_fee,
                    concession_percent=locked.concession_percent,
                    concession_amount=locked.concession_amount,
                    concession_reason=locked.concession_reason,
                    concession_granted_by=locked.concession_granted_by,
                    concession_granted_at=locked.concession_granted_at,
                    doctor_share_percent=locked.doctor_share_percent,
                    doctor_share_amount=locked.doctor_share_amount,
                    department_sequence=sequence,
                    token_number=token_number,
                    follow_up_of=locked.follow_up_of,
                    rescheduled_from=locked,
                    status=Appointment.Status.UPCOMING,
                    payment_id=locked.payment_id,
                    payment_status=original_payment_status,
                    collected_amount=locked.collected_amount,
                    payment_method=original_payment_method,
                    payment_reference=locked.payment_reference,
                    payment_recorded_by=locked.payment_recorded_by,
                    payment_recorded_at=locked.payment_recorded_at,
                    order_id=locked.order_id,
                    gateway_order_id=locked.gateway_order_id,
                    gateway_fee=locked.gateway_fee,
                    total_amount=locked.total_amount,
                    total_amount_paise=locked.total_amount_paise,
                    gateway_details=locked.gateway_details,
                )
                AppointmentProcedure.objects.bulk_create([
                    AppointmentProcedure(
                        appointment=replacement,
                        procedure=item.procedure,
                        name=item.name,
                        charge=item.charge,
                        added_by=item.added_by,
                    )
                    for item in locked.procedure_charges.select_related("procedure", "added_by").all()
                ])
        except IntegrityError:
            return Response({"detail": "The selected doctor slot has already been booked. Choose another available slot."}, status=status.HTTP_409_CONFLICT)
        schedule_appointment_confirmation(replacement.id)
        return Response(AppointmentSerializer(replacement).data)

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
    if next_status == Appointment.Status.CANCELLED and appointment.status in {Appointment.Status.CANCELLED, Appointment.Status.RESCHEDULED}:
        return Response({"detail": "This appointment is already cancelled or rescheduled."}, status=status.HTTP_409_CONFLICT)

    appointment.status = next_status
    update_fields = ["status", "updated_at"]

    if next_status == Appointment.Status.CANCELLED:
        reason = str(request.data.get("reason") or "").strip()
        if role in {UserRole.ADMIN, UserRole.COUNTER} and len(reason) < 3:
            return Response({"detail": "Enter a short cancellation reason."}, status=status.HTTP_400_BAD_REQUEST)
        appointment.cancellation_reason = reason or "Cancelled by patient"
        appointment.cancelled_by = request.user
        appointment.cancelled_at = timezone.now()
        update_fields.extend(["cancellation_reason", "cancelled_by", "cancelled_at"])
        gateway_details = appointment.gateway_details if isinstance(appointment.gateway_details, dict) else {}
        if appointment.payment_status == "Confirmed" and appointment.payment_method in {"CASH", "PAYTM_POS_MANUAL", "PAYTM_POS_AUTOMATIC"}:
            appointment.payment_status = "Refund Pending"
            appointment.refund_status = "Pending"
            appointment.refund_method = "CASH" if appointment.payment_method == "CASH" else "PAYTM_POS"
            appointment.refund_amount = appointment.fee
            update_fields.extend(["payment_status", "refund_status", "refund_method", "refund_amount"])
        elif appointment.payment_status == "Confirmed" and appointment.payment_id:
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
                    appointment.refund_status = "Initiated"
                    appointment.refund_method = "ONLINE"
                    appointment.refund_amount = refund_amount // 100
                    appointment.refund_reference = str(refund.get("id") or "") if isinstance(refund, dict) else ""
                    gateway_details["refund"] = refund
                except Exception as exc:
                    appointment.payment_status = "Refund Pending"
                    appointment.refund_status = "Pending"
                    appointment.refund_method = "ONLINE"
                    appointment.refund_amount = refund_amount // 100
                    gateway_details["refundError"] = str(exc)
            else:
                appointment.payment_status = "Refund Pending"
                appointment.refund_status = "Pending"
                appointment.refund_method = "ONLINE"
                appointment.refund_amount = refund_amount // 100
            appointment.gateway_details = gateway_details
            update_fields.extend(["payment_status", "gateway_details", "refund_status", "refund_method", "refund_amount", "refund_reference"])
        elif appointment.payment_status in {"Pending", "Pay at Counter", "Failed", ""}:
            appointment.payment_status = "No Refund Needed"
            appointment.refund_status = "Not Required"
            update_fields.extend(["payment_status", "refund_status"])
        elif appointment.payment_method == "FREE_FOLLOW_UP":
            appointment.payment_status = "No Refund Needed"
            appointment.refund_status = "Not Required"
            update_fields.extend(["payment_status", "refund_status"])

    appointment.save(update_fields=update_fields)
    return Response(AppointmentSerializer(appointment).data)


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def appointment_refund(request, pk: int):
    role = getattr(getattr(request.user, "profile", None), "role", None)
    if role not in {UserRole.ADMIN, UserRole.COUNTER}:
        return Response({"detail": "Only administrators and counter staff can record refunds."}, status=status.HTTP_403_FORBIDDEN)
    method = str(request.data.get("method") or "").strip().upper()
    reference = str(request.data.get("reference") or "").strip()
    notes = str(request.data.get("notes") or "").strip()
    if method not in {"CASH", "PAYTM_POS"}:
        return Response({"detail": "Refund method must be CASH or PAYTM_POS."}, status=status.HTTP_400_BAD_REQUEST)
    if method == "PAYTM_POS" and len(reference) < 4:
        return Response({"detail": "Enter the Paytm POS refund reference."}, status=status.HTTP_400_BAD_REQUEST)
    with transaction.atomic():
        appointment = get_object_or_404(Appointment.objects.select_for_update(), pk=pk)
        if appointment.status != Appointment.Status.CANCELLED:
            return Response({"detail": "Only a cancelled appointment can be refunded."}, status=status.HTTP_409_CONFLICT)
        if appointment.refund_status != "Pending" or appointment.refund_method not in {"CASH", "PAYTM_POS"}:
            return Response({"detail": "This appointment does not have a pending counter refund."}, status=status.HTTP_409_CONFLICT)
        appointment.refund_status = "Refunded"
        appointment.refund_method = method
        appointment.refund_reference = reference
        appointment.refund_notes = notes
        appointment.refund_recorded_by = request.user
        appointment.refund_recorded_at = timezone.now()
        appointment.payment_status = "Refunded"
        appointment.save(update_fields=["refund_status", "refund_method", "refund_reference", "refund_notes", "refund_recorded_by", "refund_recorded_at", "payment_status", "updated_at"])
    return Response(AppointmentSerializer(appointment).data)


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def manual_pos_payment(request, pk: int):
    """Record cash or a payment already completed on the clinic's physical Paytm POS."""
    role = getattr(getattr(request.user, "profile", None), "role", None)
    if role not in {UserRole.ADMIN, UserRole.COUNTER}:
        return Response({"detail": "Only administrators and counter staff can record POS payments."}, status=status.HTTP_403_FORBIDDEN)

    payment_method = str(request.data.get("method") or "PAYTM_POS_MANUAL").strip().upper()
    if payment_method not in {"CASH", "PAYTM_POS_MANUAL"}:
        return Response({"detail": "Payment method must be CASH or PAYTM_POS_MANUAL."}, status=status.HTTP_400_BAD_REQUEST)
    reference = str(request.data.get("reference") or "").strip()
    if payment_method == "PAYTM_POS_MANUAL" and (len(reference) < 4 or len(reference) > 120):
        return Response({"detail": "Enter the Paytm POS receipt/reference (4-120 characters)."}, status=status.HTTP_400_BAD_REQUEST)

    with transaction.atomic():
        appointment = get_object_or_404(Appointment.objects.select_for_update(), pk=pk)
        if appointment.status == Appointment.Status.CANCELLED:
            return Response({"detail": "A cancelled appointment cannot be marked paid."}, status=status.HTTP_409_CONFLICT)
        amount_received = max(0, appointment.fee - appointment.collected_amount)
        if not amount_received:
            return Response({"detail": "No outstanding balance to collect."}, status=409)
        if payment_method == "PAYTM_POS_MANUAL":
            duplicate = Appointment.objects.exclude(pk=appointment.pk).filter(
                payment_method="PAYTM_POS_MANUAL", payment_reference__iexact=reference
            ).exists()
            if duplicate:
                return Response({"detail": "This Paytm POS reference has already been recorded."}, status=status.HTTP_409_CONFLICT)
        else:
            reference = reference or f"CASH-BHCC-{appointment.pk:06d}"
        appointment.payment_status = "Confirmed"
        appointment.collected_amount = appointment.fee
        appointment.payment_method = payment_method
        appointment.payment_reference = reference
        appointment.payment_recorded_by = request.user
        appointment.payment_recorded_at = timezone.now()
        appointment.save(update_fields=["collected_amount", "payment_status", "payment_method", "payment_reference", "payment_recorded_by", "payment_recorded_at", "updated_at"])
        AdminAuditLog.objects.create(
            actor=request.user,
            action="CASH_PAYMENT_RECORDED" if payment_method == "CASH" else "MANUAL_POS_PAYMENT_RECORDED",
            target_type="Appointment",
            target_id=str(appointment.pk),
            summary=f"Recorded {'cash' if payment_method == 'CASH' else 'physical Paytm POS'} payment for appointment BHCC-{appointment.pk:06d}",
            metadata={"method": payment_method, "reference": reference, "amount": amount_received},
        )
    return Response(AppointmentSerializer(appointment).data)


def _paytm_result(payload):
    from .paytm_pos import result_info
    return result_info(payload)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def paytm_pos_initiate(request, pk: int):
    role = getattr(getattr(request.user, "profile", None), "role", None)
    if role not in {UserRole.ADMIN, UserRole.COUNTER}:
        return Response({"detail": "Only administrators and counter staff can initiate POS payments."}, status=status.HTTP_403_FORBIDDEN)
    appointment = get_object_or_404(Appointment, pk=pk)
    if appointment.status == Appointment.Status.CANCELLED or appointment.fee <= 0:
        return Response({"detail": "This appointment does not require a POS payment."}, status=status.HTTP_409_CONFLICT)
    if appointment.payment_status == "Confirmed":
        return Response({"detail": "This appointment is already paid."}, status=status.HTTP_409_CONFLICT)
    if appointment.collected_amount:
        return Response({"detail": "Record additional payments using cash or a physical POS receipt."}, status=409)
    from .paytm_pos import PaytmPosError, initiate_sale
    transaction_id = f"BHCC{appointment.pk}{timezone.now():%y%m%d%H%M%S}"
    try:
        details = initiate_sale(transaction_id=transaction_id, amount_rupees=appointment.fee, reference=f"BHCC-{appointment.pk:06d}")
    except PaytmPosError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    result_status, result_message = _paytm_result(details["response"])
    if result_status not in {"SUCCESS", "ACCEPTED_SUCCESS", "PENDING"}:
        return Response({"detail": result_message or "Paytm rejected the payment request."}, status=status.HTTP_502_BAD_GATEWAY)
    appointment.payment_method = "PAYTM_POS_AUTOMATIC"
    appointment.payment_reference = transaction_id
    appointment.payment_status = "Pending at POS"
    appointment.gateway_details = {"paytmPos": details}
    appointment.save(update_fields=["payment_method", "payment_reference", "payment_status", "gateway_details", "updated_at"])
    return Response(AppointmentSerializer(appointment).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def paytm_pos_status(request, pk: int):
    role = getattr(getattr(request.user, "profile", None), "role", None)
    if role not in {UserRole.ADMIN, UserRole.COUNTER}:
        return Response({"detail": "Only administrators and counter staff can verify POS payments."}, status=status.HTTP_403_FORBIDDEN)
    appointment = get_object_or_404(Appointment, pk=pk, payment_method="PAYTM_POS_AUTOMATIC")
    stored = appointment.gateway_details if isinstance(appointment.gateway_details, dict) else {}
    paytm = stored.get("paytmPos") if isinstance(stored.get("paytmPos"), dict) else {}
    request_data = paytm.get("request") if isinstance(paytm.get("request"), dict) else {}
    from .paytm_pos import PaytmPosError, enquire_status
    try:
        result = enquire_status(transaction_id=appointment.payment_reference, transaction_datetime=str(request_data.get("transactionDateTime") or ""))
    except PaytmPosError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    result_status, _ = _paytm_result(result)
    body = result.get("body") if isinstance(result.get("body"), dict) else {}
    returned_amount = str(body.get("transactionAmount") or "")
    if result_status == "SUCCESS" and returned_amount != str(appointment.fee * 100):
        return Response({"detail": "Paytm returned a different amount. Payment was not confirmed."}, status=status.HTTP_409_CONFLICT)
    stored["paytmPosStatus"] = result
    appointment.gateway_details = stored
    if result_status == "SUCCESS":
        appointment.collected_amount = appointment.fee
        appointment.payment_status = "Confirmed"
        appointment.payment_recorded_by = request.user
        appointment.payment_recorded_at = timezone.now()
    elif result_status in {"FAIL", "FAILED", "FAILURE"}:
        appointment.payment_status = "Failed"
    else:
        appointment.payment_status = "Pending at POS"
    appointment.save(update_fields=["collected_amount", "payment_status", "payment_recorded_by", "payment_recorded_at", "gateway_details", "updated_at"])
    return Response(AppointmentSerializer(appointment).data)


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def dental_procedures(request):
    from .models import DentalProcedure
    role = getattr(getattr(request.user, "profile", None), "role", None)
    if request.method == "POST":
        if role != UserRole.ADMIN:
            return Response({"detail": "Only administrators can create procedures."}, status=status.HTTP_403_FORBIDDEN)
        name = str(request.data.get("name") or "").strip()
        try: charge = int(request.data.get("charge"))
        except (TypeError, ValueError): charge = 0
        if not name or charge <= 0:
            return Response({"detail": "Procedure name and a positive charge are required."}, status=status.HTTP_400_BAD_REQUEST)
        department = str(request.data.get("department") or "").strip()
        if not Department.objects.filter(name=department).exists():
            return Response({"detail": "Select an existing department."}, status=400)
        if DentalProcedure.objects.filter(department=department, name__iexact=name).exists():
            return Response({"detail": "This procedure already exists in the department."}, status=400)
        row = DentalProcedure.objects.create(department=department, name=name, description=str(request.data.get("description") or "").strip(), charge=charge)
        return Response({"id":str(row.id),"name":row.name,"description":row.description,"department":row.department,"charge":row.charge,"isActive":row.is_active}, status=status.HTTP_201_CREATED)
    rows = DentalProcedure.objects.all() if role == UserRole.ADMIN else DentalProcedure.objects.filter(is_active=True)
    return Response([{"id":str(row.id),"name":row.name,"description":row.description,"department":row.department,"charge":row.charge,"isActive":row.is_active} for row in rows.order_by("name")])


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def dental_procedure_detail(request, pk: int):
    from .models import DentalProcedure
    if getattr(getattr(request.user, "profile", None), "role", None) != UserRole.ADMIN:
        return Response({"detail": "Only administrators can update procedures."}, status=status.HTTP_403_FORBIDDEN)
    row = get_object_or_404(DentalProcedure, pk=pk)
    if "department" in request.data:
        department = str(request.data["department"]).strip()
        if not Department.objects.filter(name=department).exists():
            return Response({"detail": "Select an existing department."}, status=400)
        row.department = department
    if "name" in request.data: row.name = str(request.data["name"]).strip()
    if "charge" in request.data:
        try: row.charge = int(request.data["charge"])
        except (TypeError, ValueError): return Response({"detail":"Charge must be a positive number."}, status=400)
    if "description" in request.data: row.description = str(request.data["description"]).strip()
    if "isActive" in request.data: row.is_active = bool(request.data["isActive"])
    if not row.name or row.charge <= 0: return Response({"detail":"Name and positive charge are required."}, status=400)
    if DentalProcedure.objects.exclude(pk=pk).filter(department=row.department, name__iexact=row.name).exists():
        return Response({"detail": "This procedure already exists in the department."}, status=400)
    row.save(); return Response({"id":str(row.id),"name":row.name,"description":row.description,"department":row.department,"charge":row.charge,"isActive":row.is_active})


@api_view(["GET", "PUT"])
@permission_classes([IsAuthenticated])
def appointment_procedures(request, pk: int):
    from .models import AppointmentProcedure, DentalProcedure
    appointment = get_object_or_404(Appointment.objects.select_related("doctor__profile"), pk=pk)
    role = getattr(getattr(request.user, "profile", None), "role", None)
    if role not in {UserRole.ADMIN, UserRole.COUNTER} and request.user.id not in {appointment.doctor_id, appointment.patient_id}:
        return Response({"detail":"Forbidden."}, status=403)
    if request.method == "PUT":
        if role not in {UserRole.ADMIN, UserRole.COUNTER} and not (role == UserRole.DOCTOR and request.user.id == appointment.doctor_id):
            return Response({"detail": "Only the assigned doctor, admin or counter can edit procedures."}, status=403)
        if appointment.status in {"Cancelled", "NoShow", "Rescheduled"} or (role == UserRole.DOCTOR and appointment.status == "Completed"):
            return Response({"detail": "This appointment cannot be edited by you."}, status=409)
        items = request.data.get("items")
        if items is None:
            ids = request.data.get("procedureIds", [])
            if not isinstance(ids, list):
                return Response({"detail": "Provide a list of procedures."}, status=400)
            items = [{"procedureId": value} for value in ids]
        if not isinstance(items, list) or any(not isinstance(item, dict) for item in items):
            return Response({"detail": "Provide a list of procedures."}, status=400)
        with transaction.atomic():
            appointment = Appointment.objects.select_for_update().get(pk=pk)
            if appointment.status in {"Cancelled", "NoShow", "Rescheduled"} or (role == UserRole.DOCTOR and appointment.status == "Completed"):
                return Response({"detail": "This appointment cannot be edited by you."}, status=409)
            if appointment.payment_status in {"Pending at POS", "Pending"} and (appointment.gateway_order_id or appointment.order_id or appointment.payment_reference):
                return Response({"detail": "Resolve the in-progress payment before changing charges."}, status=409)
            existing = {str(row.procedure_id): row for row in appointment.procedure_charges.all()}
            selected = {}
            for item in items:
                procedure_id = str(item.get("procedureId", ""))
                if not procedure_id.isdigit() or procedure_id in selected:
                    return Response({"detail": "Select valid procedures without duplicates."}, status=400)
                procedure = DentalProcedure.objects.filter(pk=procedure_id, department__iexact=appointment.department).first()
                if not procedure or (not procedure.is_active and procedure_id not in existing):
                    return Response({"detail": "Select active procedures from the appointment department."}, status=400)
                previous = existing.get(procedure_id)
                charge = item.get("charge", previous.charge if previous else procedure.charge)
                if isinstance(charge, bool) or not isinstance(charge, int) or charge < 0:
                    return Response({"detail": "Charges must be non-negative whole rupees."}, status=400)
                selected[procedure_id] = (procedure, charge)
            consultation_fee = max(0, appointment.fee - sum(row.charge for row in existing.values()))
            for procedure_id, (procedure, charge) in selected.items():
                AppointmentProcedure.objects.update_or_create(appointment=appointment, procedure=procedure, defaults={"name": existing[procedure_id].name if procedure_id in existing else procedure.name, "charge": charge, "added_by": request.user})
            appointment.procedure_charges.exclude(procedure_id__in=selected).delete()
            appointment.fee = consultation_fee + sum(charge for _, charge in selected.values())
            appointment.doctor_share_amount = appointment.fee * appointment.doctor_share_percent // 100
            appointment.payment_status = "Pay at Counter" if appointment.fee > appointment.collected_amount else "Confirmed"
            appointment.save(update_fields=["fee", "doctor_share_amount", "payment_status", "updated_at"])
            AdminAuditLog.objects.create(actor=request.user, action="APPOINTMENT_PROCEDURES_UPDATED", target_type="Appointment", target_id=str(pk), metadata={"items": items, "total": appointment.fee}, summary="Updated patient procedure charges.")
    rows = appointment.procedure_charges.all().order_by("id")
    return Response({"appointmentId":str(appointment.id),"total":appointment.fee,"appointment":AppointmentSerializer(appointment).data,"items":[{"id":str(row.id),"procedureId":str(row.procedure_id),"name":row.name,"charge":row.charge} for row in rows]})


@api_view(["GET", "PUT"])
@permission_classes([IsAuthenticated])
def availability(request):
    if request.method == "GET":
        doctor_id = request.query_params.get("doctor_id")
        date_str = request.query_params.get("date")
        if not doctor_id or not date_str:
            return Response({"detail": "doctor_id and date are required."}, status=status.HTTP_400_BAD_REQUEST)
        doctor = get_object_or_404(User.objects.select_related("profile"), pk=int(doctor_id), profile__role=UserRole.DOCTOR, is_active=True)
        obj = DoctorAvailability.objects.filter(doctor=doctor, date=date_str).first()
        if obj:
            configured_slots = list(obj.slots or [])
        else:
            try:
                requested_date = date_type.fromisoformat(date_str)
            except ValueError:
                return Response({"detail": "Invalid date. Use YYYY-MM-DD."}, status=status.HTTP_400_BAD_REQUEST)
            day_name = requested_date.strftime("%A")
            schedule = doctor.profile.weekly_schedule or {
                day: [{"start": doctor.profile.working_hours_start, "end": doctor.profile.working_hours_end}]
                for day in doctor.profile.available_days
            }
            configured_slots = []
            for window in schedule.get(day_name, []):
                try:
                    start_hour, start_minute = map(int, str(window["start"]).split(":"))
                    end_hour, end_minute = map(int, str(window["end"]).split(":"))
                except (KeyError, TypeError, ValueError):
                    continue
                current = start_hour * 60 + start_minute
                end = end_hour * 60 + end_minute
                while current < end:
                    configured_slots.append(f"{current // 60:02d}:{current % 60:02d}")
                    current += 6
        booked_slots = set(Appointment.objects.filter(doctor=doctor, date=date_str).exclude(
            status__in=[Appointment.Status.CANCELLED, Appointment.Status.NO_SHOW, Appointment.Status.RESCHEDULED]
        ).values_list("time", flat=True))
        available_slots = set(configured_slots) - booked_slots
        if date_str == timezone.localdate().isoformat():
            current_time = timezone.localtime().strftime("%H:%M")
            available_slots = {slot for slot in available_slots if slot > current_time}
        response = Response({"slots": sorted(available_slots)})
        response["Cache-Control"] = "no-store, no-cache, must-revalidate"
        return response

    ser = AvailabilitySerializer(data=request.data)
    ser.is_valid(raise_exception=True)
    doctor_id = int(ser.validated_data["doctorId"])
    date_val: date_type = ser.validated_data["date"]

    role = getattr(getattr(request.user, "profile", None), "role", None)
    if role not in {UserRole.ADMIN, UserRole.DOCTOR}:
        return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
    if role == UserRole.DOCTOR and request.user.id != doctor_id:
        return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

    slots = ser.validated_data["slots"]
    normalized_slots = []
    hourly_counts = {}
    for slot in slots:
        try:
            hour, minute = map(int, str(slot).split(":"))
        except (TypeError, ValueError):
            return Response({"detail": "Every slot must use HH:MM format."}, status=status.HTTP_400_BAD_REQUEST)
        if not (0 <= hour <= 23 and 0 <= minute <= 59):
            return Response({"detail": "Every slot must contain a valid time."}, status=status.HTTP_400_BAD_REQUEST)
        normalized = f"{hour:02d}:{minute:02d}"
        normalized_slots.append(normalized)
        hourly_counts[hour] = hourly_counts.get(hour, 0) + 1
    if len(set(normalized_slots)) != len(normalized_slots):
        return Response({"detail": "Duplicate consultation slots are not allowed."}, status=status.HTTP_400_BAD_REQUEST)
    if any(count > 10 for count in hourly_counts.values()):
        return Response({"detail": "A doctor can have at most 10 consultation slots in one hour."}, status=status.HTTP_400_BAD_REQUEST)

    obj, _ = DoctorAvailability.objects.update_or_create(
        doctor_id=doctor_id, date=date_val, defaults={"slots": sorted(normalized_slots)}
    )
    return Response({"ok": True})


@api_view(["GET", "POST"])
@permission_classes([AllowAny])
def feedback(request):
    if request.method == "GET":
        qs = Feedback.objects.filter(approved=True)
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
        rows = LabRegistration.objects.select_related("patient__profile", "department", "camp_registration__camp").order_by("-created_at")[:200]
        return Response(LabRegistrationSerializer(rows, many=True).data)

    name = (request.data.get("name") or "").strip()
    phone_no = "".join(ch for ch in str(request.data.get("phoneNo") or "") if ch.isdigit())[-10:]
    address = (request.data.get("address") or "").strip()
    native_place = (request.data.get("nativePlace") or "").strip()
    age_value = request.data.get("age")
    gender = str(request.data.get("gender") or "").strip().upper()
    portal_password = str(request.data.get("portalPassword") or "")
    try:
        age = int(age_value)
    except (TypeError, ValueError):
        age = None
    department = get_object_or_404(Department, pk=request.data.get("departmentId"))
    is_free_camp = bool(request.data.get("isFreeCamp", False))
    if not name or len(phone_no) != 10 or not address or age is None or not 0 <= age <= 120 or gender not in {"MALE", "FEMALE", "OTHER"}:
        return Response({"detail": "Name, valid 10-digit mobile number, address, age (0-120), gender, and department are required."}, status=status.HTTP_400_BAD_REQUEST)
    if portal_password:
        try:
            password_validation.validate_password(portal_password)
        except ValidationError as exc:
            return Response({"detail": " ".join(exc.messages)}, status=status.HTTP_400_BAD_REQUEST)

    with transaction.atomic():
        today = timezone.localdate()
        camp = None
        if is_free_camp:
            camp = FreeCamp.objects.select_for_update().filter(pk=request.data.get("campId"), is_active=True, status=FreeCamp.Status.OPEN, date__gte=today).first()
            if not camp:
                return Response({"detail": "Select an active free camp."}, status=status.HTTP_400_BAD_REQUEST)
            if not camp.departments.filter(pk=department.pk).exists():
                return Response({"detail": "The selected department is not part of this camp."}, status=status.HTTP_400_BAD_REQUEST)
            if camp.capacity and camp.registrations.count() >= camp.capacity:
                return Response({"detail": "This camp has reached its registration capacity."}, status=status.HTTP_409_CONFLICT)
            doctor = get_object_or_404(User.objects.select_related("profile"), pk=request.data.get("doctorId"), profile__role=UserRole.DOCTOR, is_active=True)
            if doctor.profile.department.casefold() != department.name.casefold():
                return Response({"detail": "Select a doctor from the chosen department."}, status=status.HTTP_400_BAD_REQUEST)
            camp_time = str(request.data.get("time") or "").strip()
            if not camp_time:
                return Response({"detail": "Select a doctor appointment time for the camp."}, status=status.HTTP_400_BAD_REQUEST)

        matching_profiles = list(UserProfile.objects.select_for_update().filter(phone_no=phone_no, role=UserRole.PATIENT).select_related("user"))
        existing_patient_id = request.data.get("existingPatientId")
        create_separate_patient = bool(request.data.get("createSeparatePatient", False))
        profile = next((item for item in matching_profiles if str(item.user_id) == str(existing_patient_id)), None) if existing_patient_id else None
        normalized_name = " ".join(name.casefold().split())
        if not profile:
            exact_names = [item for item in matching_profiles if " ".join(item.name.casefold().split()) == normalized_name]
            if len(exact_names) == 1:
                profile = exact_names[0]
            elif matching_profiles and not create_separate_patient:
                return Response({"detail": "This mobile number already belongs to an existing patient. Confirm the correct patient before registering.", "matches": [{"userId": str(item.user_id), "patientId": item.patient_id, "name": item.name, "phoneNo": item.phone_no} for item in matching_profiles]}, status=status.HTTP_409_CONFLICT)
        if profile:
            if portal_password:
                return Response({"detail": "This patient already exists. Use the authorized account password-reset option instead of replacing the password during registration."}, status=status.HTTP_409_CONFLICT)
            patient = profile.user
            profile.name = name
            profile.phone_no = phone_no
            profile.address = address
            profile.age = age
            profile.gender = gender
            if native_place:
                profile.native_place = native_place
            profile.save(update_fields=["name", "phone_no", "address", "age", "gender", "native_place"])
        else:
            username = f"patient-{phone_no}"
            suffix = 1
            while User.objects.filter(username=username).exists():
                suffix += 1
                username = f"patient-{phone_no}-{suffix}"
            patient = User.objects.create_user(username=username, password=portal_password or None)
            profile = UserProfile.objects.create(user=patient, role=UserRole.PATIENT, name=name, phone_no=phone_no, address=address, age=age, gender=gender, native_place=native_place)
            allocate_patient_id(profile)

        last = LabRegistration.objects.select_for_update().filter(department=department, registration_date=today).order_by("-department_sequence").first()
        sequence = (last.department_sequence if last and last.department_sequence else 0) + 1
        prefix = (department.token_prefix or "".join(word[0] for word in department.name.split())[:4] or "DEPT").upper()
        obj = LabRegistration.objects.create(
            name=name, age=age, gender=gender, phone_no=phone_no, address=address, native_place=native_place, patient=patient,
            department=department, department_sequence=sequence, token_number=f"{prefix}-{sequence:03d}",
            fee=0, is_free_camp=is_free_camp,
        )
        if camp:
            try:
                sequence, token_number = _next_appointment_token(department.name, camp.date)
                camp_appointment = Appointment.objects.create(patient=patient, doctor=doctor, patient_name=name, doctor_name=user_to_out(doctor)["name"], department=department.name, date=camp.date, time=camp_time, fee=0, department_sequence=sequence, token_number=token_number, payment_status="Free Camp")
            except IntegrityError:
                transaction.set_rollback(True)
                return Response({"detail": "This doctor slot has already been booked. Select another time."}, status=status.HTTP_409_CONFLICT)
            CampRegistration.objects.create(camp=camp, registration=obj, registered_by=request.user, doctor=doctor, appointment=camp_appointment)
    return Response(LabRegistrationSerializer(obj).data, status=status.HTTP_201_CREATED)


@api_view(["PATCH"])
@permission_classes([IsAuthenticated, IsCounter])
def registration_detail(request, pk: int):
    registration = get_object_or_404(LabRegistration.objects.select_related("patient__profile", "department"), pk=pk)
    name = str(request.data.get("name", registration.name) or "").strip()
    phone_no = "".join(ch for ch in str(request.data.get("phoneNo", registration.phone_no) or "") if ch.isdigit())[-10:]
    address = str(request.data.get("address", registration.address) or "").strip()
    gender = str(request.data.get("gender", registration.gender) or "").strip().upper()
    try:
        age = int(request.data.get("age", registration.age))
    except (TypeError, ValueError):
        age = None
    if not name or len(phone_no) != 10 or not address or age is None or not 0 <= age <= 120 or gender not in {"MALE", "FEMALE", "OTHER"}:
        return Response({"detail": "Name, valid 10-digit mobile number, address, age (0-120), and gender are required."}, status=status.HTTP_400_BAD_REQUEST)
    department = registration.department
    requested_department_id = request.data.get("departmentId")
    if requested_department_id and str(requested_department_id) != str(registration.department_id):
        department = get_object_or_404(Department, pk=requested_department_id)
        if registration.is_free_camp and not registration.camp_registration.camp.departments.filter(pk=department.pk).exists():
            return Response({"detail": "The selected department is not part of this camp."}, status=status.HTTP_400_BAD_REQUEST)

    changed_fields = [field for field, previous, current in [
        ("name", registration.name, name), ("phoneNo", registration.phone_no, phone_no),
        ("address", registration.address, address), ("age", registration.age, age),
        ("gender", registration.gender, gender), ("departmentId", registration.department_id, department.pk if department else None),
    ] if str(previous) != str(current)]
    with transaction.atomic():
        if department and department.pk != registration.department_id:
            last = LabRegistration.objects.select_for_update().filter(department=department, registration_date=registration.registration_date).exclude(pk=registration.pk).order_by("-department_sequence").first()
            registration.department_sequence = (last.department_sequence if last and last.department_sequence else 0) + 1
            prefix = (department.token_prefix or "".join(word[0] for word in department.name.split())[:4] or "DEPT").upper()
            registration.token_number = f"{prefix}-{registration.department_sequence:03d}"
        registration.name = name
        registration.phone_no = phone_no
        registration.address = address
        registration.age = age
        registration.gender = gender
        registration.department = department
        registration.native_place = str(request.data.get("nativePlace", registration.native_place) or "").strip()
        registration.save()
        if registration.patient_id:
            profile = registration.patient.profile
            profile.name = name
            profile.phone_no = phone_no
            profile.address = address
            profile.age = age
            profile.gender = gender
            profile.native_place = registration.native_place
            profile.save(update_fields=["name", "phone_no", "address", "age", "gender", "native_place"])
        AdminAuditLog.objects.create(actor=request.user, action="PATIENT_REGISTRATION_UPDATED", target_type="LabRegistration", target_id=str(registration.pk), summary=f"Updated registration for patient ID {registration.patient.profile.patient_id if registration.patient_id else 'unlinked'}", metadata={"changedFields": changed_fields})
    return Response(LabRegistrationSerializer(registration).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsCounter])
def patient_lookup(request):
    query = str(request.query_params.get("q") or "").strip()
    if query:
        if len(query) < 2:
            return Response({"detail": "Enter at least 2 characters to search."}, status=status.HTTP_400_BAD_REQUEST)
        digits = "".join(ch for ch in query if ch.isdigit())
        filters = Q(name__icontains=query) | Q(patient_id__icontains=query)
        if digits:
            filters |= Q(phone_no__icontains=digits[-10:])
        rows = UserProfile.objects.filter(filters, role=UserRole.PATIENT).select_related("user").order_by("name")[:20]
        return Response([{"userId": str(row.user_id), "patientId": row.patient_id, "name": row.name, "phoneNo": row.phone_no, "address": row.address, "age": row.age, "gender": row.gender, "nativePlace": row.native_place, "exactMatch": False} for row in rows])
    phone_no = "".join(ch for ch in str(request.query_params.get("phone") or "") if ch.isdigit())[-10:]
    if len(phone_no) != 10:
        return Response({"detail": "Enter a valid 10-digit mobile number."}, status=status.HTTP_400_BAD_REQUEST)
    requested_name = " ".join(str(request.query_params.get("name") or "").casefold().split())
    rows = UserProfile.objects.filter(phone_no=phone_no, role=UserRole.PATIENT).select_related("user").order_by("name")
    return Response([{"userId": str(row.user_id), "patientId": row.patient_id, "name": row.name, "phoneNo": row.phone_no, "address": row.address, "age": row.age, "gender": row.gender, "nativePlace": row.native_place, "exactMatch": bool(requested_name and " ".join(row.name.casefold().split()) == requested_name)} for row in rows])


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def free_camps(request):
    role = getattr(getattr(request.user, "profile", None), "role", None)
    if role not in {UserRole.ADMIN, UserRole.COUNTER}:
        return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
    if request.method == "POST":
        if role != UserRole.ADMIN:
            return Response({"detail": "Only administrators can create camps."}, status=status.HTTP_403_FORBIDDEN)
        name = (request.data.get("name") or "").strip()
        camp_date = request.data.get("date")
        department_ids = request.data.get("departmentIds") or []
        if not name or not camp_date:
            return Response({"detail": "Camp name and date are required."}, status=status.HTTP_400_BAD_REQUEST)
        camp = FreeCamp.objects.create(
            name=name, date=camp_date,
            location=(request.data.get("location") or "Bhaktivedanta Health Care Center").strip(),
            capacity=request.data.get("capacity") or None, created_by=request.user,
        )
        if department_ids:
            camp.departments.set(Department.objects.filter(pk__in=department_ids))
        return Response({"id": str(camp.id)}, status=status.HTTP_201_CREATED)
    rows = FreeCamp.objects.prefetch_related("departments").order_by("-date")
    if role == UserRole.COUNTER:
        rows = rows.filter(is_active=True, status=FreeCamp.Status.OPEN)
    output = []
    for row in rows:
        department_counts = {item["registration__department_id"]: item["patientCount"] for item in row.registrations.values("registration__department_id").annotate(patientCount=Count("id"))}
        camp_departments = list(row.departments.all())
        output.append({
            "id": str(row.id), "name": row.name, "date": row.date, "location": row.location,
            "capacity": row.capacity, "isActive": row.is_active, "status": row.status,
            "registrationCount": sum(department_counts.values()),
            "departments": DepartmentSerializer(camp_departments, many=True).data,
            "departmentStats": [{"departmentId": str(department.id), "departmentName": department.name, "patientCount": department_counts.get(department.id, 0)} for department in camp_departments],
        })
    return Response(output)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated, IsAdmin])
def free_camp_detail(request, pk: int):
    camp = get_object_or_404(FreeCamp, pk=pk)
    if request.method == "DELETE":
        if camp.registrations.exists():
            return Response({"detail": "A camp with registered patients cannot be permanently deleted. Cancel or close it instead so patient records remain available."}, status=status.HTTP_409_CONFLICT)
        camp.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
    for field in ("name", "location"):
        if field in request.data:
            value = str(request.data[field]).strip()
            if not value:
                return Response({"detail": f"Camp {field} is required."}, status=status.HTTP_400_BAD_REQUEST)
            setattr(camp, field, value)
    if "date" in request.data:
        camp.date = request.data["date"]
    if "capacity" in request.data:
        capacity = request.data["capacity"] or None
        if capacity is not None:
            try:
                capacity = int(capacity)
            except (TypeError, ValueError):
                return Response({"detail": "Camp capacity must be a positive whole number or empty for unlimited."}, status=status.HTTP_400_BAD_REQUEST)
            if capacity < 1:
                return Response({"detail": "Camp capacity must be a positive whole number or empty for unlimited."}, status=status.HTTP_400_BAD_REQUEST)
            if capacity < camp.registrations.count():
                return Response({"detail": "Camp capacity cannot be lower than its current registration count."}, status=status.HTTP_400_BAD_REQUEST)
        camp.capacity = capacity
    if "departmentIds" in request.data:
        department_ids = request.data.get("departmentIds") or []
        departments = Department.objects.filter(pk__in=department_ids)
        if departments.count() != len(set(str(value) for value in department_ids)):
            return Response({"detail": "One or more selected departments are invalid."}, status=status.HTTP_400_BAD_REQUEST)
        used_department_ids = set(camp.registrations.values_list("registration__department_id", flat=True))
        selected_department_ids = set(departments.values_list("id", flat=True))
        if not used_department_ids.issubset(selected_department_ids):
            return Response({"detail": "A department with registered patients cannot be removed from this camp."}, status=status.HTTP_409_CONFLICT)
        camp.departments.set(departments)
    if "status" in request.data:
        if request.data["status"] not in {value for value, _ in FreeCamp.Status.choices}:
            return Response({"detail": "Invalid camp status."}, status=status.HTTP_400_BAD_REQUEST)
        camp.status = request.data["status"]
        camp.is_active = camp.status in {FreeCamp.Status.DRAFT, FreeCamp.Status.OPEN}
    camp.save()
    return Response({"ok": True})


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsCounter])
def registration_receipt_printed(request, pk: int):
    registration = get_object_or_404(LabRegistration, pk=pk, is_free_camp=True)
    camp_registration = get_object_or_404(CampRegistration, registration=registration)
    camp_registration.receipt_print_count += 1
    camp_registration.save(update_fields=["receipt_print_count"])
    return Response({"ok": True, "printCount": camp_registration.receipt_print_count})


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def payroll(request):
    role = getattr(getattr(request.user, "profile", None), "role", None)
    month_text = request.query_params.get("month") or request.data.get("month") or timezone.localdate().strftime("%Y-%m")
    try:
        month = date_type.fromisoformat(f"{month_text[:7]}-01")
    except ValueError:
        return Response({"detail": "Month must use YYYY-MM format."}, status=status.HTTP_400_BAD_REQUEST)

    if role == UserRole.ADMIN:
        if request.method == "POST":
            employees = User.objects.filter(profile__role__in=[UserRole.DOCTOR, UserRole.COUNTER, UserRole.STAFF], is_active=True).select_related("profile")
            for employee in employees:
                PayrollRecord.objects.get_or_create(employee=employee, month=month, defaults={"amount": employee.profile.salary or 0})
        rows = PayrollRecord.objects.filter(month=month).select_related("employee__profile", "confirmed_by__profile")
    elif role in {UserRole.DOCTOR, UserRole.COUNTER, UserRole.STAFF}:
        if request.method != "GET":
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
        rows = PayrollRecord.objects.filter(employee=request.user).select_related("employee__profile", "confirmed_by__profile")
    else:
        return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
    return Response(PayrollRecordSerializer(rows, many=True).data)


@api_view(["PATCH"])
@permission_classes([IsAuthenticated, IsAdmin])
def payroll_detail(request, pk: int):
    row = get_object_or_404(PayrollRecord.objects.select_related("employee__profile", "confirmed_by__profile"), pk=pk)
    next_status = request.data.get("status")
    if next_status not in {PayrollRecord.Status.PENDING, PayrollRecord.Status.PAID}:
        return Response({"detail": "Status must be PENDING or PAID."}, status=status.HTTP_400_BAD_REQUEST)
    row.status = next_status
    row.payment_method = (request.data.get("paymentMethod") or "").strip()
    row.reference = (request.data.get("reference") or "").strip()
    row.remarks = (request.data.get("remarks") or "").strip()
    if next_status == PayrollRecord.Status.PAID:
        row.payment_date = request.data.get("paymentDate") or timezone.localdate()
        row.confirmed_by = request.user
        row.confirmed_at = timezone.now()
    else:
        row.payment_date = None
        row.confirmed_by = None
        row.confirmed_at = None
    row.save()
    record_admin_action(request, action="PAYROLL_STATUS_UPDATED", target_type="PayrollRecord", target_id=str(row.pk), summary=f"{row.employee.profile.name}: {row.status}")
    return Response(PayrollRecordSerializer(row).data)


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
    medical_registration_number = (payload.get("medicalRegistrationNumber") or "").strip()
    registration_council = (payload.get("registrationCouncil") or "").strip()
    qualification = (payload.get("qualification") or "").strip()
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

    if not (name and email and password and department and specialty and experience and medical_registration_number and registration_council and qualification and fee > 0 and common_profile["phone_no"]):
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
        medical_registration_number=medical_registration_number,
        registration_council=registration_council,
        qualification=qualification,
        fee=fee,
        salary=salary if salary > 0 else None,
        available_days=available_days,
        working_hours_start=start,
        working_hours_end=end,
        weekly_schedule=weekly_schedule,
        **common_profile,
        **spiritual_profile,
    )
    transaction.on_commit(lambda: send_admin_notification(event="Doctor account created", summary=f"Doctor account created for {name} ({email})."))
    record_admin_action(request, action="ACCOUNT_CREATED", target_type="USER", target_id=user.id, summary=f"Doctor account created for {name}.")
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
    transaction.on_commit(lambda: send_admin_notification(event="Staff account created", summary=f"{role} account created for {name} ({email})."))
    record_admin_action(request, action="ACCOUNT_CREATED", target_type="USER", target_id=user.id, summary=f"{role} account created for {name}.")
    return Response({"uid": str(user.id), "email": email, "role": role}, status=status.HTTP_201_CREATED)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated, IsAdmin])
def admin_update_account(request, pk: int):
    user = get_object_or_404(User.objects.select_related("profile"), pk=pk)
    if request.method == "DELETE":
        if user.pk == request.user.pk:
            return Response({"detail": "You cannot delete your own administrator account."}, status=status.HTTP_400_BAD_REQUEST)
        role = getattr(user.profile, "role", None)
        identity = user.email or user.username
        has_clinical_records = user.patient_appointments.exists() or user.doctor_appointments.exists() or user.consultations_given.exists() or user.consultations_received.exists()
        purge_requested = _truthy(request.data.get("purgeClinicalRecords"))
        expected_confirmation = f"DELETE {identity}"
        if has_clinical_records and not purge_requested:
            return Response({"detail": "This account has protected clinical records and cannot be permanently deleted. Deactivate its login instead so appointments, prescriptions, and audit history remain intact."}, status=status.HTTP_409_CONFLICT)
        if purge_requested:
            if str(request.data.get("confirmation") or "").strip() != expected_confirmation:
                return Response({"detail": f"Type {expected_confirmation} to confirm permanent removal of this test account and all linked clinical records."}, status=status.HTTP_400_BAD_REQUEST)
            record_admin_action(request, action="ACCOUNT_PURGED", target_type="USER", target_id=user.id, summary=f"Test {role} account {identity} purged with clinical records.")
            with transaction.atomic():
                Appointment.objects.filter(Q(patient=user) | Q(doctor=user)).delete()
                try:
                    user.delete()
                except ProtectedError:
                    return Response({"detail": "This account is referenced by protected audit records and cannot be purged. Deactivate it instead."}, status=status.HTTP_409_CONFLICT)
            transaction.on_commit(lambda: send_admin_notification(event="Test account purged", summary=f"The {role} test account {identity} and its linked clinical records were permanently deleted by an administrator."))
            return Response(status=status.HTTP_204_NO_CONTENT)
        record_admin_action(request, action="ACCOUNT_DELETED", target_type="USER", target_id=user.id, summary=f"{role} account {identity} permanently deleted.")
        try:
            user.delete()
        except ProtectedError:
            return Response({"detail": "This account has protected clinical records and cannot be permanently deleted. Deactivate its login instead so appointments, prescriptions, and audit history remain intact."}, status=status.HTTP_409_CONFLICT)
        transaction.on_commit(lambda: send_admin_notification(event="Account deleted", summary=f"The {role} account {identity} was permanently deleted by an administrator."))
        return Response(status=status.HTTP_204_NO_CONTENT)

    if user.pk == request.user.pk and request.data.get("isActive") is False:
        return Response({"detail": "You cannot disable your own account."}, status=status.HTTP_400_BAD_REQUEST)
    next_role = None
    if "role" in request.data:
        next_role = str(request.data.get("role") or "").strip().upper()
        allowed_roles = {choice for choice, _ in UserRole.choices} - {UserRole.PUBLIC}
        if next_role not in allowed_roles:
            return Response({"detail": "Invalid account role."}, status=status.HTTP_400_BAD_REQUEST)
        if user.pk == request.user.pk and next_role != UserRole.ADMIN:
            return Response({"detail": "You cannot remove your own administrator role."}, status=status.HTTP_400_BAD_REQUEST)

    notifications: list[tuple[str, str]] = []
    if "isActive" in request.data:
        next_active = _truthy(request.data.get("isActive"))
        if user.is_active != next_active:
            user.is_active = next_active
            user.save(update_fields=["is_active"])
            label = "re-enabled" if next_active else "disabled"
            notifications.append((f"Account {label}", f"Account {user.email or user.username} was {label} by an administrator."))

    if "role" in request.data:
        profile = _ensure_profile(user)
        if profile.role != next_role:
            previous_role = profile.role
            profile.role = next_role
            profile.save(update_fields=["role"])
            notifications.append(("Account role changed", f"Account {user.email or user.username} changed from {previous_role} to {next_role}."))

    profile = _ensure_profile(user)
    changed_fields: list[str] = []
    if "name" in request.data:
        name = str(request.data.get("name") or "").strip()
        if not name:
            return Response({"detail": "Name cannot be empty."}, status=status.HTTP_400_BAD_REQUEST)
        profile.name = name
        user.first_name = name
        user.save(update_fields=["first_name"])
        changed_fields.append("name")
    if "email" in request.data:
        email = str(request.data.get("email") or "").strip().lower()
        try:
            validate_email(email)
        except ValidationError:
            return Response({"detail": "Enter a valid email address."}, status=status.HTTP_400_BAD_REQUEST)
        if User.objects.exclude(pk=user.pk).filter(Q(email__iexact=email) | Q(username__iexact=email)).exists():
            return Response({"detail": "That email address is already in use."}, status=status.HTTP_409_CONFLICT)
        previous_email = user.email
        user.email = email
        if not user.username or user.username.lower() == (previous_email or "").lower():
            user.username = email
        user.save(update_fields=["email", "username"])
        record_admin_action(request, action="PROFILE_UPDATED", target_type="USER", target_id=user.id, summary="Administrator changed the account email address.")

    text_fields = {
        "phoneNo": "phone_no", "address": "address", "nativePlace": "native_place",
        "profession": "profession", "staffType": "staff_type", "department": "department",
        "specialty": "specialty", "experience": "experience", "qualification": "qualification",
        "medicalRegistrationNumber": "medical_registration_number", "registrationCouncil": "registration_council",
    }
    for api_field, model_field in text_fields.items():
        if api_field in request.data:
            setattr(profile, model_field, str(request.data.get(api_field) or "").strip())
            changed_fields.append(model_field)
    if "gender" in request.data:
        gender = str(request.data.get("gender") or "").strip().upper()
        if gender not in {"", "MALE", "FEMALE", "OTHER"}:
            return Response({"detail": "Gender must be MALE, FEMALE, OTHER, or blank."}, status=status.HTTP_400_BAD_REQUEST)
        profile.gender = gender
        changed_fields.append("gender")
    for api_field, model_field, maximum in (("age", "age", 120), ("salary", "salary", None), ("fee", "fee", None)):
        if api_field in request.data:
            raw_value = request.data.get(api_field)
            if raw_value in (None, ""):
                value = None
            else:
                try:
                    value = int(raw_value)
                except (TypeError, ValueError):
                    return Response({"detail": f"{api_field} must be a whole number."}, status=status.HTTP_400_BAD_REQUEST)
                if value < 0 or (maximum is not None and value > maximum):
                    return Response({"detail": f"Enter a valid {api_field}."}, status=status.HTTP_400_BAD_REQUEST)
            setattr(profile, model_field, value)
            changed_fields.append(model_field)
    if changed_fields:
        profile.save(update_fields=sorted(set(changed_fields)))
        summary = f"Administrator edited profile fields for {user.email or user.username}: {', '.join(sorted(set(changed_fields)))}."
        record_admin_action(request, action="PROFILE_UPDATED", target_type="USER", target_id=user.id, summary=summary)

    for event, summary in notifications:
        transaction.on_commit(lambda event=event, summary=summary: send_admin_notification(event=event, summary=summary))
        record_admin_action(request, action="ACCOUNT_UPDATED", target_type="USER", target_id=user.id, summary=summary)
    user = User.objects.select_related("profile").get(pk=user.pk)
    return Response(user_to_out(user))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def admin_reset_account_password(request, pk: int):
    role = getattr(getattr(request.user, "profile", None), "role", None)
    if role not in {UserRole.ADMIN, UserRole.COUNTER}:
        return Response({"detail": "Only administrators and counter staff can reset patient passwords."}, status=status.HTTP_403_FORBIDDEN)
    user = get_object_or_404(User.objects.select_related("profile"), pk=pk)
    if role == UserRole.COUNTER and user.profile.role != UserRole.PATIENT:
        return Response({"detail": "Counter staff can reset patient passwords only."}, status=status.HTTP_403_FORBIDDEN)
    if user.pk == request.user.pk:
        return Response({"detail": "Use your own profile to change the current administrator password."}, status=status.HTTP_400_BAD_REQUEST)
    new_password = str(request.data.get("password") or "")
    try:
        password_validation.validate_password(new_password, user)
    except ValidationError as exc:
        return Response({"detail": " ".join(exc.messages)}, status=status.HTTP_400_BAD_REQUEST)
    user.set_password(new_password)
    user.is_active = True
    user.save(update_fields=["password", "is_active"])
    identity = user.email or user.username
    actor = "An administrator" if role == UserRole.ADMIN else "Counter staff"
    transaction.on_commit(lambda: send_admin_notification(event="Account password reset", summary=f"{actor} reset and reactivated the {user.profile.role} account {identity}."))
    record_admin_action(request, action="PASSWORD_RESET", target_type="USER", target_id=user.id, summary=f"{actor} reset the {user.profile.role} account password.")
    return Response({"ok": True, "user": {**user_to_out(user), "isActive": True}})


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsAdmin])
def admin_staff_accounts(request):
    users = User.objects.filter(profile__role__in=[UserRole.ADMIN, UserRole.COUNTER, UserRole.STAFF]).select_related("profile").order_by("profile__name", "username")
    return Response([user_to_out(user) for user in users])


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsAdmin])
def admin_all_accounts(request):
    users = User.objects.exclude(profile__role=UserRole.PUBLIC).select_related("profile").order_by("profile__role", "profile__name", "username")
    return Response([{**user_to_out(user), "isActive": user.is_active} for user in users])


@api_view(["POST"])
@permission_classes([AllowAny])
def contact(request):
    name = (request.data.get("name") or "").strip()
    email = (request.data.get("email") or "").strip()
    subject = (request.data.get("subject") or "General Inquiry").strip()
    message = (request.data.get("message") or "").strip()
    if not (name and email and message):
        return Response({"detail": "name, email, and message are required."}, status=status.HTTP_400_BAD_REQUEST)

    delivered = send_contact_notification(
        sender_name=name,
        sender_email=email,
        inquiry_subject=subject,
        message=message,
    ).delivered
    if not delivered:
        return Response(
            {"detail": "Your message could not be delivered right now. Please try again later."},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    return Response({"status": "success", "message": "Your message has been sent successfully!"})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def payments_create_order(request):
    user = request.user
    role = getattr(getattr(user, "profile", None), "role", None)
    if role != UserRole.PATIENT:
        return Response({"detail": "Only patients can create orders."}, status=status.HTTP_403_FORBIDDEN)

    appointment_data = request.data.get("appointmentData") or {}

    doctor_id = int(appointment_data.get("doctorId") or 0)
    if doctor_id <= 0:
        return Response({"detail": "doctorId is required."}, status=status.HTTP_400_BAD_REQUEST)
    doctor = User.objects.get(pk=doctor_id)
    base_fee = int(doctor.profile.fee or 0)
    fee = base_fee

    try:
        appt_date = date_type.fromisoformat(str(appointment_data.get("date") or ""))
    except ValueError:
        return Response({"detail": "Invalid date. Use YYYY-MM-DD."}, status=status.HTTP_400_BAD_REQUEST)

    appt_time = str(appointment_data.get("time") or "").strip()
    if not appt_time:
        return Response({"detail": "time is required."}, status=status.HTTP_400_BAD_REQUEST)

    try:
        with transaction.atomic():
            follow_up = None
            follow_up_id = appointment_data.get("followUpOf")
            if follow_up_id:
                follow_up = get_object_or_404(Appointment.objects.select_for_update(), pk=follow_up_id)
                follow_up_error = _follow_up_error(follow_up, user, doctor, appt_date)
                if follow_up_error:
                    return Response({"detail": follow_up_error}, status=status.HTTP_409_CONFLICT)
                fee = 0
            elif base_fee <= 0:
                return Response({"detail": "Valid fee is required."}, status=status.HTTP_400_BAD_REQUEST)
            gateway_fee = int((fee * 0.02) + 0.9999) if fee else 0
            final_amount = fee + gateway_fee
            department_name = appointment_data.get("department") or doctor.profile.department
            sequence, token_number = _next_appointment_token(department_name, appt_date)
            appt = Appointment.objects.create(
                patient=user,
                doctor=doctor,
                patient_name=appointment_data.get("patientName") or user_to_out(user)["name"],
                doctor_name=appointment_data.get("doctorName") or user_to_out(doctor)["name"],
                department=department_name,
                date=appt_date,
                time=appt_time,
                fee=fee,
                base_consultation_fee=0 if follow_up else base_fee,
                doctor_share_percent=50,
                doctor_share_amount=fee // 2,
                department_sequence=sequence,
                token_number=token_number,
                follow_up_of=follow_up,
                status=Appointment.Status.UPCOMING,
                payment_status="Free Follow-up" if follow_up else "Pending",
                payment_method="FREE_FOLLOW_UP" if follow_up else "",
                order_id="",
                gateway_fee=gateway_fee,
                total_amount=final_amount,
                total_amount_paise=final_amount * 100,
            )
    except IntegrityError:
        return Response({"detail": "This appointment slot was just booked by another patient. Please choose another available time."}, status=status.HTTP_409_CONFLICT)

    if appt.follow_up_of_id:
        schedule_appointment_confirmation(appt.id)
        return Response({"orderId": str(appt.id), "gatewayOrderId": "", "amount": 0, "amountPaise": 0, "currency": "INR", "offlinePayment": True, "freeFollowUp": True, "message": "Your free follow-up appointment has been booked."})

    key_id = os.getenv("RAZORPAY_KEY_ID")
    key_secret = os.getenv("RAZORPAY_KEY_SECRET")
    if not key_id or not key_secret:
        appt.payment_status = "Pay at Counter"
        appt.order_id = str(appt.id)
        appt.gateway_fee = 0
        appt.total_amount = fee
        appt.total_amount_paise = fee * 100
        appt.save(update_fields=["payment_status", "order_id", "gateway_fee", "total_amount", "total_amount_paise", "updated_at"])
        schedule_appointment_confirmation(appt.id)
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
        transaction.on_commit(lambda: send_admin_notification(event="Appointment payment failure", summary=f"Payment order creation failed for appointment BHCC-{appt.id:06d}."))
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

        appt.collected_amount = appt.fee
        appt.payment_status = "Confirmed"
        appt.status = Appointment.Status.UPCOMING
        appt.payment_id = rzp_payment_id
        appt.payment_method = "RAZORPAY"
        appt.payment_reference = rzp_payment_id
        appt.payment_recorded_at = timezone.now()
        appt.gateway_details = gateway_response
        appt.save(update_fields=["collected_amount", "payment_status", "status", "payment_id", "payment_method", "payment_reference", "payment_recorded_at", "gateway_details", "updated_at"])
        schedule_appointment_confirmation(appt.id)
        return Response({"status": "success", "message": "Payment verified and appointment confirmed."})

    appt.payment_status = "Failed"
    appt.status = Appointment.Status.CANCELLED
    appt.gateway_details = gateway_response
    appt.save(update_fields=["payment_status", "status", "gateway_details", "updated_at"])
    transaction.on_commit(lambda: send_admin_notification(event="Appointment payment failure", summary=f"Payment failed or was cancelled for appointment BHCC-{appt.id:06d}."))
    return Response({"status": "failed", "message": "Payment failed or was cancelled."}, status=status.HTTP_400_BAD_REQUEST)
