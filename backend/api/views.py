from __future__ import annotations
import hmac
import logging
import os
import secrets
from datetime import date as date_type, timedelta

from django.contrib.auth import authenticate, password_validation
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError
from django.contrib.auth.models import User
from django.conf import settings
from django.db import transaction
from django.db.models.deletion import ProtectedError
from django.db.models import Q, Sum
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
from .models import Appointment, ConsentRecord, Department, DoctorAvailability, EmailOTP, Feedback, LabRegistration, UserProfile, UserRole, allocate_patient_id
from .operational_views import client_ip, record_admin_action
from .permissions import IsAdmin, IsCounter
from .serializers import (
    AppointmentSerializer,
    DepartmentSerializer,
    LabRegistrationSerializer,
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
    current_week_start = today - timedelta(days=6)
    previous_week_start = today - timedelta(days=13)
    previous_week_end = current_week_start - timedelta(days=1)

    current_week_appointments = Appointment.objects.filter(
        date__range=(current_week_start, today)
    ).count()
    previous_week_appointments = Appointment.objects.filter(
        date__range=(previous_week_start, previous_week_end)
    ).count()
    if previous_week_appointments:
        weekly_growth = round(
            ((current_week_appointments - previous_week_appointments) / previous_week_appointments) * 100,
            1,
        )
    else:
        weekly_growth = 100.0 if current_week_appointments else 0.0

    collected_revenue = (
        Appointment.objects.filter(
            Q(payment_status__iexact="Confirmed") | Q(status=Appointment.Status.COMPLETED)
        ).aggregate(total=Sum("fee"))["total"]
        or 0
    )
    recent_appointments = Appointment.objects.select_related("patient", "doctor").order_by("-created_at")[:10]

    return Response(
        {
            "totalPatients": UserProfile.objects.filter(role=UserRole.PATIENT).count(),
            "appointmentsToday": Appointment.objects.filter(date=today).count(),
            "activeDoctors": UserProfile.objects.filter(
                role=UserRole.DOCTOR, user__is_active=True
            ).count(),
            "grossRevenue": collected_revenue,
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
        schedule_appointment_confirmation(obj.id)
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

    for event, summary in notifications:
        transaction.on_commit(lambda event=event, summary=summary: send_admin_notification(event=event, summary=summary))
        record_admin_action(request, action="ACCOUNT_UPDATED", target_type="USER", target_id=user.id, summary=summary)
    return Response(user_to_out(user))


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAdmin])
def admin_reset_account_password(request, pk: int):
    user = get_object_or_404(User.objects.select_related("profile"), pk=pk)
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
    transaction.on_commit(lambda: send_admin_notification(event="Account password reset", summary=f"An administrator reset and reactivated the {user.profile.role} account {identity}."))
    record_admin_action(request, action="PASSWORD_RESET", target_type="USER", target_id=user.id, summary=f"Administrator reset the {user.profile.role} account password.")
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

        appt.payment_status = "Confirmed"
        appt.status = Appointment.Status.UPCOMING
        appt.payment_id = rzp_payment_id
        appt.gateway_details = gateway_response
        appt.save(update_fields=["payment_status", "status", "payment_id", "gateway_details", "updated_at"])
        schedule_appointment_confirmation(appt.id)
        return Response({"status": "success", "message": "Payment verified and appointment confirmed."})

    appt.payment_status = "Failed"
    appt.status = Appointment.Status.CANCELLED
    appt.gateway_details = gateway_response
    appt.save(update_fields=["payment_status", "status", "gateway_details", "updated_at"])
    transaction.on_commit(lambda: send_admin_notification(event="Appointment payment failure", summary=f"Payment failed or was cancelled for appointment BHCC-{appt.id:06d}."))
    return Response({"status": "failed", "message": "Payment failed or was cancelled."}, status=status.HTTP_400_BAD_REQUEST)
