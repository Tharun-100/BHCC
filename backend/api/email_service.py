from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Mapping, Sequence

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.db import transaction
from django.template.loader import render_to_string
from django.utils import timezone

from .models import Appointment

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class EmailDeliveryResult:
    delivered: bool


def _clean_subject(subject: str) -> str:
    return " ".join(subject.replace("\r", " ").replace("\n", " ").split())


def _send_templated_email(
    *,
    subject: str,
    recipients: Sequence[str],
    template_name: str,
    context: Mapping[str, Any],
    reply_to: Sequence[str] | None = None,
) -> EmailDeliveryResult:
    clean_recipients = [address.strip() for address in recipients if address and address.strip()]
    if not clean_recipients:
        logger.warning("Email was not sent because %s has no recipient.", template_name)
        return EmailDeliveryResult(delivered=False)

    template_context = {
        **context,
        "support_email": settings.SUPPORT_EMAIL,
        "clinic_name": "Bhaktivedanta Healthcare Centre",
    }
    text_body = render_to_string(f"emails/{template_name}.txt", template_context)
    html_body = render_to_string(f"emails/{template_name}.html", template_context)
    message = EmailMultiAlternatives(
        subject=_clean_subject(subject),
        body=text_body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=clean_recipients,
        reply_to=[address for address in (reply_to or []) if address],
    )
    message.attach_alternative(html_body, "text/html")

    try:
        delivered = message.send(fail_silently=False) == 1
    except Exception as exc:  # The provider exception is deliberately not returned to API clients.
        logger.warning(
            "Transactional email delivery failed for template=%s error_type=%s",
            template_name,
            type(exc).__name__,
        )
        return EmailDeliveryResult(delivered=False)
    return EmailDeliveryResult(delivered=delivered)


def send_staff_login_otp(*, recipient: str, recipient_name: str, code: str) -> EmailDeliveryResult:
    return _send_templated_email(
        subject="Your BHCC staff login code",
        recipients=[recipient],
        template_name="staff_login_otp",
        context={"recipient_name": recipient_name, "code": code, "expires_minutes": 10},
        reply_to=[settings.SUPPORT_EMAIL],
    )


def send_verification_email(*, recipient: str, recipient_name: str, verification_url: str) -> EmailDeliveryResult:
    return _send_templated_email(subject="Verify your BHCC email", recipients=[recipient], template_name="email_verification", context={"recipient_name": recipient_name or "Patient", "action_url": verification_url, "expires_hours": 24}, reply_to=[settings.SUPPORT_EMAIL])


def send_password_reset_email(*, recipient: str, recipient_name: str, reset_url: str) -> EmailDeliveryResult:
    return _send_templated_email(subject="Reset your BHCC password", recipients=[recipient], template_name="password_reset", context={"recipient_name": recipient_name or "Patient", "action_url": reset_url, "expires_hours": 24}, reply_to=[settings.SUPPORT_EMAIL])


def send_password_changed_email(*, recipient: str, recipient_name: str) -> EmailDeliveryResult:
    return _send_templated_email(subject="Your BHCC password was changed", recipients=[recipient], template_name="password_changed", context={"recipient_name": recipient_name or "User", "changed_at": timezone.now().strftime("%Y-%m-%d %H:%M UTC")}, reply_to=[settings.SUPPORT_EMAIL])


def send_admin_notification(*, event: str, summary: str) -> EmailDeliveryResult:
    return _send_templated_email(subject=f"[BHCC Admin] {event}", recipients=[settings.ADMIN_NOTIFICATION_EMAIL], template_name="admin_notification", context={"event": event, "summary": summary, "occurred_at": timezone.now().strftime("%Y-%m-%d %H:%M UTC")}, reply_to=[settings.SUPPORT_EMAIL])


def send_contact_notification(
    *, sender_name: str, sender_email: str, inquiry_subject: str, message: str
) -> EmailDeliveryResult:
    return _send_templated_email(
        subject=f"[BHCC Contact] {_clean_subject(inquiry_subject)}",
        recipients=[settings.CLINIC_TO_EMAIL],
        template_name="contact_notification",
        context={
            "sender_name": sender_name,
            "sender_email": sender_email,
            "inquiry_subject": inquiry_subject,
            "message": message,
        },
        reply_to=[sender_email],
    )


def send_appointment_confirmation(appointment_id: int) -> EmailDeliveryResult:
    """Send once for a committed appointment and persist the successful outcome."""
    with transaction.atomic():
        appointment = (
            Appointment.objects.select_for_update()
            .select_related("patient", "doctor")
            .get(pk=appointment_id)
        )
        if appointment.confirmation_email_sent_at:
            return EmailDeliveryResult(delivered=True)

        recipient = (appointment.patient.email or appointment.patient.username).strip()
        result = _send_templated_email(
            subject=f"Appointment confirmed — BHCC-{appointment.id:06d}",
            recipients=[recipient],
            template_name="appointment_confirmation",
            context={
                "recipient_name": appointment.patient_name or appointment.patient.get_full_name() or "Patient",
                "appointment_reference": f"BHCC-{appointment.id:06d}",
                "appointment_date": appointment.date.strftime("%A, %d %B %Y"),
                "appointment_time": appointment.time,
                "doctor_name": appointment.doctor_name or appointment.doctor.get_full_name(),
                "department": appointment.department,
                "clinic_location": settings.CLINIC_LOCATION,
                "payment_status": appointment.payment_status,
            },
            reply_to=[settings.SUPPORT_EMAIL],
        )
        if result.delivered:
            appointment.confirmation_email_sent_at = timezone.now()
            appointment.save(update_fields=["confirmation_email_sent_at"])
        return result


def schedule_appointment_confirmation(appointment_id: int) -> None:
    transaction.on_commit(lambda: send_appointment_confirmation(appointment_id))
