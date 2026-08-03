from __future__ import annotations

from datetime import date, timedelta
from unittest.mock import patch

from django.contrib.auth.models import User
from django.core import mail
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from .email_service import (
    send_appointment_confirmation,
    send_contact_notification,
    send_staff_login_otp,
)
from .models import Appointment, Department, UserProfile, UserRole


EMAIL_TEST_SETTINGS = {
    "EMAIL_BACKEND": "django.core.mail.backends.locmem.EmailBackend",
    "DEFAULT_FROM_EMAIL": "Bhaktivedanta Healthcare <noreply@bhaktivedantahealthcare.tech>",
    "SUPPORT_EMAIL": "support@bhaktivedantahealthcare.tech",
    "CLINIC_TO_EMAIL": "clinic@example.com",
    "CLINIC_LOCATION": "Newtown, Kolkata",
    "FRONTEND_URL": "https://example.test",
    "ADMIN_NOTIFICATION_EMAIL": "admin@example.com",
}


@override_settings(**EMAIL_TEST_SETTINGS)
class TransactionalEmailTests(TestCase):
    def setUp(self) -> None:
        self.patient = User.objects.create_user(
            username="patient@example.com",
            email="patient@example.com",
            password="safe-test-password",
            first_name="Patient",
        )
        self.doctor = User.objects.create_user(
            username="doctor@example.com",
            email="doctor@example.com",
            password="safe-test-password",
            first_name="Doctor",
        )

    def test_staff_otp_renders_text_and_html_without_exposing_unrelated_data(self) -> None:
        result = send_staff_login_otp(
            recipient="doctor@example.com", recipient_name="Doctor", code="123456"
        )

        self.assertTrue(result.delivered)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("123456", mail.outbox[0].body)
        self.assertEqual(len(mail.outbox[0].alternatives), 1)
        self.assertEqual(mail.outbox[0].reply_to, ["support@bhaktivedantahealthcare.tech"])

    def test_contact_notification_uses_sender_as_reply_to(self) -> None:
        result = send_contact_notification(
            sender_name="Visitor",
            sender_email="visitor@example.com",
            inquiry_subject="Opening hours",
            message="When is the clinic open?",
        )

        self.assertTrue(result.delivered)
        self.assertEqual(mail.outbox[0].to, ["clinic@example.com"])
        self.assertEqual(mail.outbox[0].reply_to, ["visitor@example.com"])
        self.assertIn("When is the clinic open?", mail.outbox[0].body)

    def test_contact_api_does_not_expose_provider_exception(self) -> None:
        client = APIClient()
        with patch("api.email_service.EmailMultiAlternatives.send", side_effect=RuntimeError("provider secret detail")):
            response = client.post(
                "/api/contact/",
                {
                    "name": "Visitor",
                    "email": "visitor@example.com",
                    "subject": "Question",
                    "message": "Hello",
                },
                format="json",
            )

        self.assertEqual(response.status_code, 503)
        self.assertNotIn("provider secret detail", response.content.decode())

    def test_appointment_confirmation_is_sent_only_once(self) -> None:
        appointment = Appointment.objects.create(
            patient=self.patient,
            doctor=self.doctor,
            patient_name="Patient",
            doctor_name="Doctor",
            department="Cardiology",
            date=date(2026, 8, 10),
            time="10:30",
            fee=1000,
            payment_status="Confirmed",
        )

        first = send_appointment_confirmation(appointment.id)
        second = send_appointment_confirmation(appointment.id)

        self.assertTrue(first.delivered)
        self.assertTrue(second.delivered)
        self.assertEqual(len(mail.outbox), 1)
        appointment.refresh_from_db()
        self.assertIsNotNone(appointment.confirmation_email_sent_at)
        self.assertIn(f"BHCC-{appointment.id:06d}", mail.outbox[0].body)
        self.assertNotIn("diagnosis", mail.outbox[0].body.lower())

    def test_provider_failure_leaves_appointment_eligible_for_retry(self) -> None:
        appointment = Appointment.objects.create(
            patient=self.patient,
            doctor=self.doctor,
            patient_name="Patient",
            doctor_name="Doctor",
            department="Dental",
            date=date(2026, 8, 11),
            time="11:00",
            fee=500,
            payment_status="Pay at Counter",
        )

        with patch("api.email_service.EmailMultiAlternatives.send", side_effect=RuntimeError("delivery failed")):
            result = send_appointment_confirmation(appointment.id)

        self.assertFalse(result.delivered)
        appointment.refresh_from_db()
        self.assertIsNone(appointment.confirmation_email_sent_at)


class AdminDashboardTests(TestCase):
    def setUp(self) -> None:
        self.admin = User.objects.create_user(username="admin@example.com", password="admin-password")
        UserProfile.objects.create(user=self.admin, role=UserRole.ADMIN, name="Admin")
        self.patient = User.objects.create_user(username="patient-live@example.com", password="patient-password")
        UserProfile.objects.create(user=self.patient, role=UserRole.PATIENT, name="Live Patient")
        self.doctor = User.objects.create_user(username="doctor-live@example.com", password="doctor-password")
        UserProfile.objects.create(user=self.doctor, role=UserRole.DOCTOR, name="Live Doctor")
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def test_admin_dashboard_uses_database_values(self) -> None:
        today = timezone.localdate()
        Appointment.objects.create(
            patient=self.patient,
            doctor=self.doctor,
            patient_name="Live Patient",
            doctor_name="Live Doctor",
            department="Dental",
            date=today,
            time="10:00",
            fee=750,
            status=Appointment.Status.COMPLETED,
            payment_status="Confirmed",
        )
        Appointment.objects.create(
            patient=self.patient,
            doctor=self.doctor,
            patient_name="Older Patient",
            doctor_name="Live Doctor",
            department="Dental",
            date=today - timedelta(days=8),
            time="11:00",
            fee=500,
            payment_status="Pending",
        )

        response = self.client.get("/api/admin/dashboard/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["totalPatients"], 1)
        self.assertEqual(response.data["appointmentsToday"], 1)
        self.assertEqual(response.data["activeDoctors"], 1)
        self.assertEqual(response.data["grossRevenue"], 750)
        self.assertEqual(response.data["currentWeekAppointments"], 1)
        self.assertEqual(response.data["completedToday"], 1)
        self.assertEqual(response.data["weeklyGrowthPercent"], 0.0)
        self.assertEqual(len(response.data["recentAppointments"]), 2)

    def test_non_admin_cannot_access_dashboard_summary(self) -> None:
        self.client.force_authenticate(self.patient)
        response = self.client.get("/api/admin/dashboard/")
        self.assertEqual(response.status_code, 403)

    def test_refresh_token_returns_a_new_access_token(self) -> None:
        refresh = RefreshToken.for_user(self.admin)
        self.client.force_authenticate(user=None)

        response = self.client.post(
            "/api/auth/token/refresh/", {"refresh": str(refresh)}, format="json"
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["access"])

    def test_admin_can_create_department_with_only_a_name(self) -> None:
        response = self.client.post(
            "/api/departments/", {"name": "Neurology"}, format="json"
        )

        self.assertEqual(response.status_code, 201)
        department = Department.objects.get(name="Neurology")
        self.assertEqual(department.icon, "")
        self.assertEqual(department.description, "")
        self.assertEqual(department.base_fee, 0)

    def test_department_rejects_a_negative_base_fee(self) -> None:
        response = self.client.post(
            "/api/departments/",
            {"name": "Invalid Fee", "baseFee": -1},
            format="json",
        )

        self.assertEqual(response.status_code, 400)

    @override_settings(**EMAIL_TEST_SETTINGS)
    def test_admin_account_status_change_sends_notification(self) -> None:
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.patch(
                f"/api/admin/accounts/{self.doctor.id}/", {"isActive": False}, format="json"
            )
        self.assertEqual(response.status_code, 200)
        self.doctor.refresh_from_db()
        self.assertFalse(self.doctor.is_active)
        self.assertEqual(mail.outbox[-1].to, ["admin@example.com"])
        self.assertIn("disabled", mail.outbox[-1].subject.lower())


@override_settings(**EMAIL_TEST_SETTINGS)
class AccountSecurityEmailTests(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()
        self.patient = User.objects.create_user(username="security@example.com", email="security@example.com", password="Original-safe-password-94", first_name="Security")
        self.profile = UserProfile.objects.create(user=self.patient, role=UserRole.PATIENT, name="Security Patient")

    def test_password_reset_response_is_neutral_and_email_is_generated_only_for_known_user(self) -> None:
        known = self.client.post("/api/auth/password-reset/", {"email": self.patient.email}, format="json")
        unknown = self.client.post("/api/auth/password-reset/", {"email": "unknown@example.com"}, format="json")
        self.assertEqual(known.status_code, 200)
        self.assertEqual(known.data["detail"], unknown.data["detail"])
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("/reset-password?uid=", mail.outbox[0].body)

    def test_reset_token_is_single_use_and_changes_password(self) -> None:
        from django.contrib.auth.tokens import default_token_generator
        from django.utils.encoding import force_bytes
        from django.utils.http import urlsafe_base64_encode
        uid = urlsafe_base64_encode(force_bytes(self.patient.pk))
        token = default_token_generator.make_token(self.patient)
        first = self.client.post("/api/auth/password-reset/confirm/", {"uid": uid, "token": token, "password": "New-safe-password-95"}, format="json")
        second = self.client.post("/api/auth/password-reset/confirm/", {"uid": uid, "token": token, "password": "Another-safe-password-96"}, format="json")
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 400)
        self.patient.refresh_from_db()
        self.assertTrue(self.patient.check_password("New-safe-password-95"))
        self.assertIn("password was changed", mail.outbox[-1].subject.lower())

    def test_verification_token_activates_once_and_resend_obeys_cooldown(self) -> None:
        from django.contrib.auth.tokens import default_token_generator
        from django.utils.encoding import force_bytes
        from django.utils.http import urlsafe_base64_encode
        self.patient.is_active = False
        self.patient.save(update_fields=["is_active"])
        uid = urlsafe_base64_encode(force_bytes(self.patient.pk))
        token = default_token_generator.make_token(self.patient)
        first = self.client.post("/api/auth/verify-email/", {"uid": uid, "token": token}, format="json")
        second = self.client.post("/api/auth/verify-email/", {"uid": uid, "token": token}, format="json")
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 400)
        self.patient.refresh_from_db()
        self.assertTrue(self.patient.is_active)

        other = User.objects.create_user(username="unverified@example.com", email="unverified@example.com", password="Safe-password-97", is_active=False)
        other_profile = UserProfile.objects.create(user=other, role=UserRole.PATIENT, name="Unverified", verification_sent_at=timezone.now())
        before = len(mail.outbox)
        response = self.client.post("/api/auth/resend-verification/", {"email": other.email}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(mail.outbox), before)
