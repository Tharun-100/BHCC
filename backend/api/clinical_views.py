from __future__ import annotations

from datetime import datetime, timedelta
from io import BytesIO

from django.contrib.auth.models import User
from django.db import transaction
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .email_service import send_prescription_ready_email
from .models import (
    Appointment, AttendanceAuditLog, AttendanceRecord, Consultation, LeaveRequest,
    Prescription, PrescriptionAuditLog, PrescriptionMedicine, PrescriptionTest,
    UserRole,
)
from .permissions import IsAdmin
from .serializers import user_to_out

STAFF_ROLES = {UserRole.DOCTOR, UserRole.ADMIN, UserRole.COUNTER, UserRole.STAFF}


def _role(user: User) -> str | None:
    return getattr(getattr(user, "profile", None), "role", None)


def _attendance_out(row: AttendanceRecord) -> dict:
    return {
        "id": str(row.id), "employee": user_to_out(row.employee), "date": row.date.isoformat(),
        "scheduledStart": row.scheduled_start, "scheduledEnd": row.scheduled_end,
        "checkedInAt": row.checked_in_at.isoformat() if row.checked_in_at else None,
        "checkedOutAt": row.checked_out_at.isoformat() if row.checked_out_at else None,
        "status": row.status, "lateMinutes": row.late_minutes, "workedMinutes": row.worked_minutes,
        "adminNotes": row.admin_notes,
    }


def _leave_out(row: LeaveRequest) -> dict:
    return {"id": str(row.id), "employee": user_to_out(row.employee), "leaveType": row.leave_type, "startDate": row.start_date.isoformat(), "endDate": row.end_date.isoformat(), "reason": row.reason, "status": row.status, "createdAt": row.created_at.isoformat()}


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def attendance(request):
    if _role(request.user) not in STAFF_ROLES:
        return Response({"detail": "Attendance is available only to clinic staff."}, status=status.HTTP_403_FORBIDDEN)
    if request.method == "GET":
        rows = AttendanceRecord.objects.filter(employee=request.user).select_related("employee", "employee__profile")[:120]
        return Response([_attendance_out(row) for row in rows])

    action = str(request.data.get("action") or "").upper()
    today = timezone.localdate()
    profile = request.user.profile
    row, _ = AttendanceRecord.objects.get_or_create(employee=request.user, date=today, defaults={"scheduled_start": profile.working_hours_start, "scheduled_end": profile.working_hours_end})
    now = timezone.now()
    if action == "CHECK_IN":
        if row.checked_in_at:
            return Response({"detail": "You have already checked in today."}, status=status.HTTP_400_BAD_REQUEST)
        row.checked_in_at = now
        try:
            scheduled = timezone.make_aware(datetime.combine(today, datetime.strptime(row.scheduled_start or "09:00", "%H:%M").time()))
            row.late_minutes = max(0, int((now - scheduled).total_seconds() // 60))
        except ValueError:
            row.late_minutes = 0
        row.status = AttendanceRecord.Status.LATE if row.late_minutes > 0 else AttendanceRecord.Status.PRESENT
        row.save()
    elif action == "CHECK_OUT":
        if not row.checked_in_at:
            return Response({"detail": "Check in before checking out."}, status=status.HTTP_400_BAD_REQUEST)
        if row.checked_out_at:
            return Response({"detail": "You have already checked out today."}, status=status.HTTP_400_BAD_REQUEST)
        row.checked_out_at = now
        row.worked_minutes = max(0, int((now - row.checked_in_at).total_seconds() // 60))
        if row.worked_minutes < 240:
            row.status = AttendanceRecord.Status.HALF_DAY
        row.save()
    else:
        return Response({"detail": "Action must be CHECK_IN or CHECK_OUT."}, status=status.HTTP_400_BAD_REQUEST)
    return Response(_attendance_out(row))


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def leave_requests(request):
    if _role(request.user) not in STAFF_ROLES:
        return Response({"detail": "Leave requests are available only to clinic staff."}, status=status.HTTP_403_FORBIDDEN)
    if request.method == "GET":
        return Response([_leave_out(row) for row in LeaveRequest.objects.filter(employee=request.user).select_related("employee", "employee__profile").order_by("-created_at")])
    try:
        start = datetime.strptime(str(request.data.get("startDate")), "%Y-%m-%d").date()
        end = datetime.strptime(str(request.data.get("endDate")), "%Y-%m-%d").date()
    except ValueError:
        return Response({"detail": "Enter valid leave dates."}, status=status.HTTP_400_BAD_REQUEST)
    if end < start:
        return Response({"detail": "End date cannot be before start date."}, status=status.HTTP_400_BAD_REQUEST)
    reason = str(request.data.get("reason") or "").strip()
    leave_type = str(request.data.get("leaveType") or "").strip()
    if not reason or not leave_type:
        return Response({"detail": "Leave type and reason are required."}, status=status.HTTP_400_BAD_REQUEST)
    row = LeaveRequest.objects.create(employee=request.user, leave_type=leave_type, start_date=start, end_date=end, reason=reason)
    return Response(_leave_out(row), status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsAdmin])
def admin_attendance(request):
    rows = AttendanceRecord.objects.select_related("employee", "employee__profile")
    date_value = request.query_params.get("date")
    month_value = request.query_params.get("month")
    if date_value:
        rows = rows.filter(date=date_value)
    elif month_value:
        try:
            year, month = map(int, month_value.split("-"))
            rows = rows.filter(date__year=year, date__month=month)
        except ValueError:
            return Response({"detail": "Month must use YYYY-MM."}, status=status.HTTP_400_BAD_REQUEST)
    return Response([_attendance_out(row) for row in rows[:1000]])


@api_view(["PATCH"])
@permission_classes([IsAuthenticated, IsAdmin])
def admin_attendance_detail(request, pk: int):
    row = get_object_or_404(AttendanceRecord, pk=pk)
    reason = str(request.data.get("reason") or "").strip()
    if not reason:
        return Response({"detail": "A correction reason is required."}, status=status.HTTP_400_BAD_REQUEST)
    previous = _attendance_out(row)
    if "status" in request.data and request.data["status"] in AttendanceRecord.Status.values:
        row.status = request.data["status"]
    row.admin_notes = str(request.data.get("adminNotes") or row.admin_notes)
    row.save()
    AttendanceAuditLog.objects.create(attendance=row, changed_by=request.user, previous_values=previous, new_values=_attendance_out(row), reason=reason)
    return Response(_attendance_out(row))


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsAdmin])
def admin_leave_requests(request):
    return Response([_leave_out(row) for row in LeaveRequest.objects.select_related("employee", "employee__profile").order_by("-created_at")[:500]])


@api_view(["PATCH"])
@permission_classes([IsAuthenticated, IsAdmin])
def admin_leave_detail(request, pk: int):
    row = get_object_or_404(LeaveRequest, pk=pk)
    next_status = str(request.data.get("status") or "").upper()
    if next_status not in {LeaveRequest.Status.APPROVED, LeaveRequest.Status.REJECTED}:
        return Response({"detail": "Status must be APPROVED or REJECTED."}, status=status.HTTP_400_BAD_REQUEST)
    row.status = next_status
    row.reviewed_by = request.user
    row.reviewed_at = timezone.now()
    row.save(update_fields=["status", "reviewed_by", "reviewed_at"])
    if next_status == LeaveRequest.Status.APPROVED:
        day = row.start_date
        while day <= row.end_date:
            AttendanceRecord.objects.update_or_create(employee=row.employee, date=day, defaults={"status": AttendanceRecord.Status.LEAVE})
            day += timedelta(days=1)
    return Response(_leave_out(row))


def _prescription_out(row: Prescription, include_clinical: bool = True) -> dict:
    consultation = row.consultation
    result = {
        "id": str(row.id), "prescriptionNumber": row.prescription_number, "version": row.version,
        "status": row.status, "finalizedAt": row.finalized_at.isoformat() if row.finalized_at else None,
        "appointmentId": str(consultation.appointment_id), "appointmentReference": f"BHCC-{consultation.appointment_id:06d}",
        "patient": user_to_out(consultation.patient), "doctor": user_to_out(consultation.doctor),
        "appointmentDate": consultation.appointment.date.isoformat(), "department": consultation.appointment.department,
    }
    if include_clinical:
        result.update({"symptoms": consultation.symptoms, "observations": consultation.observations, "diagnosis": consultation.diagnosis, "advice": consultation.advice, "followUpDate": consultation.follow_up_date.isoformat() if consultation.follow_up_date else None,
            "medicines": [{"name": m.name, "strength": m.strength, "dosageForm": m.dosage_form, "dose": m.dose, "frequency": m.frequency, "duration": m.duration, "foodInstructions": m.food_instructions, "notes": m.notes} for m in row.medicines.all()],
            "tests": [{"name": t.name, "instructions": t.instructions} for t in row.tests.all()]})
    return result


def _owned_appointment(user: User, pk: int) -> Appointment:
    return get_object_or_404(Appointment.objects.select_related("patient", "patient__profile", "doctor", "doctor__profile"), pk=pk, doctor=user)


@api_view(["GET", "PUT"])
@permission_classes([IsAuthenticated])
def appointment_prescription(request, appointment_id: int):
    if _role(request.user) != UserRole.DOCTOR:
        return Response({"detail": "Only doctors can edit prescriptions."}, status=status.HTTP_403_FORBIDDEN)
    appointment = _owned_appointment(request.user, appointment_id)
    consultation, _ = Consultation.objects.get_or_create(appointment=appointment, defaults={"doctor": request.user, "patient": appointment.patient})
    prescription = consultation.prescriptions.order_by("-version").first()
    if request.method == "GET":
        return Response(_prescription_out(prescription) if prescription else {"appointmentId": str(appointment.id), "patient": user_to_out(appointment.patient), "doctor": user_to_out(request.user), "status": "NONE"})
    if prescription and prescription.status != Prescription.Status.DRAFT:
        return Response({"detail": "Finalized prescriptions cannot be edited. Create an amendment."}, status=status.HTTP_400_BAD_REQUEST)
    payload = request.data or {}
    with transaction.atomic():
        consultation.symptoms = str(payload.get("symptoms") or "").strip()
        consultation.observations = str(payload.get("observations") or "").strip()
        consultation.diagnosis = str(payload.get("diagnosis") or "").strip()
        consultation.advice = str(payload.get("advice") or "").strip()
        consultation.follow_up_date = payload.get("followUpDate") or None
        consultation.save()
        if not prescription:
            prescription = Prescription.objects.create(consultation=consultation, prescription_number=f"RX-{appointment.id:06d}-V1", version=1)
        prescription.medicines.all().delete()
        prescription.tests.all().delete()
        for index, med in enumerate(payload.get("medicines") or []):
            if str(med.get("name") or "").strip():
                PrescriptionMedicine.objects.create(prescription=prescription, name=str(med.get("name")).strip(), strength=str(med.get("strength") or ""), dosage_form=str(med.get("dosageForm") or ""), dose=str(med.get("dose") or ""), frequency=str(med.get("frequency") or ""), duration=str(med.get("duration") or ""), food_instructions=str(med.get("foodInstructions") or ""), notes=str(med.get("notes") or ""), position=index)
        for index, test in enumerate(payload.get("tests") or []):
            if str(test.get("name") or "").strip():
                PrescriptionTest.objects.create(prescription=prescription, name=str(test.get("name")).strip(), instructions=str(test.get("instructions") or ""), position=index)
        PrescriptionAuditLog.objects.create(prescription=prescription, performed_by=request.user, action="DRAFT_SAVED")
    return Response(_prescription_out(prescription))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def finalize_prescription(request, pk: int):
    row = get_object_or_404(Prescription.objects.select_related("consultation__appointment", "consultation__patient", "consultation__doctor"), pk=pk, consultation__doctor=request.user)
    if _role(request.user) != UserRole.DOCTOR or row.status != Prescription.Status.DRAFT:
        return Response({"detail": "Only the assigned doctor can finalize a draft."}, status=status.HTTP_403_FORBIDDEN)
    if not row.consultation.diagnosis.strip() or not row.medicines.exists():
        return Response({"detail": "Diagnosis and at least one medicine are required before finalization."}, status=status.HTTP_400_BAD_REQUEST)
    row.status = Prescription.Status.FINALIZED
    row.finalized_at = timezone.now()
    row.save(update_fields=["status", "finalized_at"])
    consultation = row.consultation
    consultation.status = Consultation.Status.COMPLETED
    consultation.save(update_fields=["status"])
    consultation.appointment.status = Appointment.Status.COMPLETED
    consultation.appointment.save(update_fields=["status", "updated_at"])
    PrescriptionAuditLog.objects.create(prescription=row, performed_by=request.user, action="FINALIZED")
    patient = consultation.patient
    transaction.on_commit(lambda: send_prescription_ready_email(recipient=patient.email or patient.username, recipient_name=patient.profile.name, appointment_reference=f"BHCC-{consultation.appointment_id:06d}"))
    return Response(_prescription_out(row))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def amend_prescription(request, pk: int):
    current = get_object_or_404(Prescription.objects.select_related("consultation__doctor"), pk=pk, consultation__doctor=request.user, status=Prescription.Status.FINALIZED)
    with transaction.atomic():
        current.status = Prescription.Status.SUPERSEDED
        current.save(update_fields=["status"])
        version = current.version + 1
        new = Prescription.objects.create(consultation=current.consultation, prescription_number=f"RX-{current.consultation.appointment_id:06d}-V{version}", version=version)
        for med in current.medicines.all():
            med.pk = None; med.prescription = new; med.save()
        for test in current.tests.all():
            test.pk = None; test.prescription = new; test.save()
        PrescriptionAuditLog.objects.create(prescription=new, performed_by=request.user, action="AMENDMENT_CREATED", summary=f"Amends {current.prescription_number}")
    return Response(_prescription_out(new), status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def prescriptions(request):
    rows = Prescription.objects.filter(status=Prescription.Status.FINALIZED).select_related("consultation__appointment", "consultation__patient__profile", "consultation__doctor__profile").prefetch_related("medicines", "tests")
    role = _role(request.user)
    if role == UserRole.PATIENT:
        rows = rows.filter(consultation__patient=request.user)
    elif role == UserRole.DOCTOR:
        rows = rows.filter(consultation__doctor=request.user)
    elif role == UserRole.ADMIN:
        pass
    else:
        return Response({"detail": "Prescriptions are visible only to the patient and assigned doctor."}, status=status.HTTP_403_FORBIDDEN)
    return Response([_prescription_out(row) for row in rows])


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def prescription_pdf(request, pk: int):
    row = get_object_or_404(Prescription.objects.select_related("consultation__appointment", "consultation__patient__profile", "consultation__doctor__profile").prefetch_related("medicines", "tests"), pk=pk, status=Prescription.Status.FINALIZED)
    if request.user not in {row.consultation.patient, row.consultation.doctor} and _role(request.user) != UserRole.ADMIN:
        return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas
    buffer = BytesIO(); pdf = canvas.Canvas(buffer, pagesize=A4); width, height = A4; y = height - 50
    def line(text: str, size: int = 10, gap: int = 18):
        nonlocal y
        if y < 60: pdf.showPage(); y = height - 50
        pdf.setFont("Helvetica", size); pdf.drawString(45, y, str(text)[:110]); y -= gap
    doctor = row.consultation.doctor; patient = row.consultation.patient; profile = doctor.profile
    line("BHAKTIVEDANTA HEALTH CARE CENTER", 16, 26); line(f"E-Prescription: {row.prescription_number}", 12, 22)
    line(f"Patient: {patient.profile.name} ({patient.profile.patient_id or 'ID pending'})")
    line(f"Doctor: {profile.name} | {profile.qualification} | {profile.specialty}")
    line(f"Registration: {profile.medical_registration_number} ({profile.registration_council})")
    line(f"Consultation date: {row.consultation.appointment.date} | Department: {row.consultation.appointment.department}", 10, 26)
    line(f"Diagnosis: {row.consultation.diagnosis}", 11, 22); line("Medicines", 12, 22)
    for index, med in enumerate(row.medicines.all(), 1): line(f"{index}. {med.name} {med.strength} {med.dosage_form} - {med.dose}, {med.frequency}, {med.duration}; {med.food_instructions} {med.notes}")
    if row.tests.exists(): line("Tests advised", 12, 22)
    for test in row.tests.all(): line(f"- {test.name}: {test.instructions}")
    line(f"Advice: {row.consultation.advice}", 10, 22); line(f"Follow-up: {row.consultation.follow_up_date or 'As advised'}")
    pdf.save(); buffer.seek(0)
    PrescriptionAuditLog.objects.create(prescription=row, performed_by=request.user, action="PDF_DOWNLOADED")
    return FileResponse(buffer, as_attachment=True, filename=f"{row.prescription_number}.pdf", content_type="application/pdf")
