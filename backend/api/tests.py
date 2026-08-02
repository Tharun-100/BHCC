from __future__ import annotations

from datetime import date
from unittest.mock import patch

from django.contrib.auth.models import User
from django.core import mail
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from .email_service import (
    send_appointment_confirmation,
    send_contact_notification,
    send_staff_login_otp,
)
from .models import Appointment


EMAIL_TEST_SETTINGS = {
    "EMAIL_BACKEND": "django.core.mail.backends.locmem.EmailBackend",
    "DEFAULT_FROM_EMAIL": "Bhaktivedanta Healthcare <noreply@bhaktivedantahealthcare.tech>",
    "SUPPORT_EMAIL": "support@bhaktivedantahealthcare.tech",
    "CLINIC_TO_EMAIL": "clinic@example.com",
    "CLINIC_LOCATION": "Newtown, Kolkata",
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
