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
from .models import Appointment, AttendanceAuditLog, AttendanceRecord, CampRegistration, Department, DoctorAvailability, FreeCamp, LabRegistration, PayrollRecord, Prescription, UserProfile, UserRole, allocate_patient_id


class ClinicOperationsTests(TestCase):
    def setUp(self):
        self.patient = User.objects.create_user(username="operations-patient@example.com", password="safe-test-password")
        UserProfile.objects.create(user=self.patient, role=UserRole.PATIENT, name="Patient")
        self.doctor = User.objects.create_user(username="operations-doctor@example.com", password="safe-test-password")
        UserProfile.objects.create(user=self.doctor, role=UserRole.DOCTOR, name="Doctor", salary=40000, department="Dental", fee=500)
        self.counter = User.objects.create_user(username="operations-counter@example.com", password="safe-test-password")
        UserProfile.objects.create(user=self.counter, role=UserRole.COUNTER, name="Counter", salary=20000)
        self.admin = User.objects.create_user(username="operations-admin@example.com", password="safe-test-password")
        UserProfile.objects.create(user=self.admin, role=UserRole.ADMIN, name="Admin")
        self.department = Department.objects.create(name="Dental", base_fee=500, token_prefix="DEN", location="Room 2")

    def test_active_doctor_slot_cannot_be_booked_twice(self):
        client = APIClient(); client.force_authenticate(self.patient)
        payload = {"patientName":"Patient", "doctorId":str(self.doctor.id), "doctorName":"Doctor", "department":"Dental", "date":date.today(), "time":"10:00", "fee":500}
        self.assertEqual(client.post("/api/appointments/", payload, format="json").status_code, 201)
        self.assertEqual(client.post("/api/appointments/", payload, format="json").status_code, 409)

    def test_booked_slot_disappears_and_cancelled_slot_reopens(self):
        appointment_date = date.today() + timedelta(days=1)
        DoctorAvailability.objects.create(doctor=self.doctor, date=appointment_date, slots=["10:00", "10:15"])
        appointment = Appointment.objects.create(
            patient=self.patient, doctor=self.doctor, patient_name="Patient", doctor_name="Doctor",
            department="Dental", date=appointment_date, time="10:00", fee=500,
        )
        client = APIClient(); client.force_authenticate(self.patient)
        response = client.get(f"/api/availability/?doctor_id={self.doctor.id}&date={appointment_date.isoformat()}")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["slots"], ["10:15"])
        appointment.status = Appointment.Status.CANCELLED
        appointment.save(update_fields=["status", "updated_at"])
        response = client.get(f"/api/availability/?doctor_id={self.doctor.id}&date={appointment_date.isoformat()}")
        self.assertEqual(response.data["slots"], ["10:00", "10:15"])

    def test_weekly_schedule_generates_six_minute_slots_and_caps_custom_hour(self):
        appointment_date = date.today() + timedelta(days=2)
        profile = self.doctor.profile
        profile.weekly_schedule = {appointment_date.strftime("%A"): [{"start":"10:00", "end":"11:00"}]}
        profile.save(update_fields=["weekly_schedule"])
        client = APIClient(); client.force_authenticate(self.admin)
        generated = client.get(f"/api/availability/?doctor_id={self.doctor.id}&date={appointment_date.isoformat()}")
        self.assertEqual(generated.status_code, 200)
        self.assertEqual(generated.data["slots"], ["10:00", "10:06", "10:12", "10:18", "10:24", "10:30", "10:36", "10:42", "10:48", "10:54"])

        too_many = [f"10:{minute:02d}" for minute in range(11)]
        rejected = client.put("/api/availability/", {"doctorId":str(self.doctor.id), "date":appointment_date, "slots":too_many}, format="json")
        self.assertEqual(rejected.status_code, 400)
        self.assertIn("at most 10", rejected.data["detail"])

    def test_appointment_department_tokens_increment_and_reset_daily(self):
        client = APIClient(); client.force_authenticate(self.counter)
        tomorrow = date.today() + timedelta(days=1)
        base = {"patientId": str(self.patient.id), "patientName": "Patient", "doctorId": str(self.doctor.id), "doctorName": "Doctor", "department": "Dental", "fee": 500}
        first = client.post("/api/appointments/", {**base, "date": date.today(), "time": "14:00"}, format="json")
        second = client.post("/api/appointments/", {**base, "date": date.today(), "time": "14:15"}, format="json")
        next_day = client.post("/api/appointments/", {**base, "date": tomorrow, "time": "14:00"}, format="json")
        self.assertEqual((first.status_code, second.status_code, next_day.status_code), (201, 201, 201))
        self.assertEqual(Appointment.objects.get(pk=first.data["id"]).token_number, "DEN-001")
        self.assertEqual(Appointment.objects.get(pk=second.data["id"]).token_number, "DEN-002")
        self.assertEqual(Appointment.objects.get(pk=next_day.data["id"]).token_number, "DEN-001")

    def test_one_free_follow_up_with_same_doctor_within_fourteen_days(self):
        original = Appointment.objects.create(
            patient=self.patient, doctor=self.doctor, patient_name="Patient", doctor_name="Doctor",
            department="Dental", date=date.today(), time="09:00", fee=500,
            status=Appointment.Status.COMPLETED, payment_status="Confirmed", payment_method="CASH",
        )
        client = APIClient(); client.force_authenticate(self.counter)
        payload = {"patientId":str(self.patient.id), "patientName":"Patient", "doctorId":str(self.doctor.id), "doctorName":"Doctor", "department":"Dental", "date":date.today()+timedelta(days=14), "time":"09:15", "fee":500, "followUpOf":str(original.id)}
        response = client.post("/api/appointments/", payload, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.data["isFreeFollowUp"])
        follow_up = Appointment.objects.get(pk=response.data["id"])
        self.assertEqual(follow_up.fee, 0)
        self.assertEqual(follow_up.payment_method, "FREE_FOLLOW_UP")
        self.assertEqual(follow_up.payment_status, "Free Follow-up")

        payload["time"] = "09:30"
        duplicate = client.post("/api/appointments/", payload, format="json")
        self.assertEqual(duplicate.status_code, 409)

    def test_expired_or_unpaid_consultation_does_not_qualify_for_follow_up(self):
        original = Appointment.objects.create(
            patient=self.patient, doctor=self.doctor, patient_name="Patient", doctor_name="Doctor",
            department="Dental", date=date.today()-timedelta(days=15), time="09:00", fee=500,
            status=Appointment.Status.COMPLETED, payment_status="Confirmed",
        )
        client = APIClient(); client.force_authenticate(self.counter)
        payload = {"patientId":str(self.patient.id), "patientName":"Patient", "doctorId":str(self.doctor.id), "doctorName":"Doctor", "department":"Dental", "date":date.today(), "time":"09:45", "fee":500, "followUpOf":str(original.id)}
        response = client.post("/api/appointments/", payload, format="json")
        self.assertEqual(response.status_code, 409)

    def test_counter_records_unique_manual_paytm_pos_reference(self):
        appointment = Appointment.objects.create(
            patient=self.patient, doctor=self.doctor, patient_name="Patient", doctor_name="Doctor",
            department="Dental", date=date.today(), time="11:00", fee=500, payment_status="Pay at Counter",
        )
        client = APIClient(); client.force_authenticate(self.counter)
        response = client.patch(f"/api/appointments/{appointment.id}/manual-pos-payment/", {"reference": "PAYTM-RECEIPT-101"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["paymentStatus"], "Confirmed")
        self.assertEqual(response.data["paymentMethod"], "PAYTM_POS_MANUAL")
        self.assertEqual(response.data["paymentReference"], "PAYTM-RECEIPT-101")
        appointment.refresh_from_db()
        self.assertEqual(appointment.payment_recorded_by, self.counter)
        self.assertIsNotNone(appointment.payment_recorded_at)

        other = Appointment.objects.create(
            patient=self.patient, doctor=self.doctor, patient_name="Patient", doctor_name="Doctor",
            department="Dental", date=date.today(), time="12:00", fee=500, payment_status="Pay at Counter",
        )
        duplicate = client.patch(f"/api/appointments/{other.id}/manual-pos-payment/", {"reference": "paytm-receipt-101"}, format="json")
        self.assertEqual(duplicate.status_code, 409)

    def test_patient_cannot_record_manual_pos_payment(self):
        appointment = Appointment.objects.create(
            patient=self.patient, doctor=self.doctor, patient_name="Patient", doctor_name="Doctor",
            department="Dental", date=date.today(), time="13:00", fee=500,
        )
        client = APIClient(); client.force_authenticate(self.patient)
        response = client.patch(f"/api/appointments/{appointment.id}/manual-pos-payment/", {"reference": "PAYTM-102"}, format="json")
        self.assertEqual(response.status_code, 403)

    def test_counter_records_cash_payment(self):
        appointment = Appointment.objects.create(
            patient=self.patient, doctor=self.doctor, patient_name="Patient", doctor_name="Doctor",
            department="Dental", date=date.today(), time="13:30", fee=500, payment_status="Pay at Counter",
        )
        client = APIClient(); client.force_authenticate(self.counter)
        response = client.patch(
            f"/api/appointments/{appointment.id}/manual-pos-payment/", {"method": "CASH"}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["paymentMethod"], "CASH")
        self.assertEqual(response.data["paymentStatus"], "Confirmed")
        self.assertTrue(response.data["paymentReference"].startswith("CASH-BHCC-"))

    def test_counter_cancellation_reopens_slot_and_records_cash_refund(self):
        appointment_date = date.today() + timedelta(days=1)
        DoctorAvailability.objects.create(doctor=self.doctor, date=appointment_date, slots=["15:00"])
        appointment = Appointment.objects.create(
            patient=self.patient, doctor=self.doctor, patient_name="Patient", doctor_name="Doctor",
            department="Dental", date=appointment_date, time="15:00", fee=500,
            payment_status="Confirmed", payment_method="CASH",
        )
        client = APIClient(); client.force_authenticate(self.counter)
        response = client.patch(
            f"/api/appointments/{appointment.id}/",
            {"status": "Cancelled", "reason": "Patient unable to attend"}, format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["refundStatus"], "Pending")
        self.assertEqual(response.data["refundMethod"], "CASH")
        availability_response = client.get(f"/api/availability/?doctor_id={self.doctor.id}&date={appointment_date.isoformat()}")
        self.assertEqual(availability_response.data["slots"], ["15:00"])

        refunded = client.patch(
            f"/api/appointments/{appointment.id}/refund/",
            {"method": "CASH", "notes": "Returned at reception"}, format="json",
        )
        self.assertEqual(refunded.status_code, 200)
        self.assertEqual(refunded.data["paymentStatus"], "Refunded")
        self.assertEqual(refunded.data["refundStatus"], "Refunded")

    def test_counter_reschedules_and_transfers_payment_to_replacement(self):
        original_date = date.today() + timedelta(days=1)
        new_date = date.today() + timedelta(days=2)
        appointment = Appointment.objects.create(
            patient=self.patient, doctor=self.doctor, patient_name="Patient", doctor_name="Doctor",
            department="Dental", date=original_date, time="09:00", fee=450,
            base_consultation_fee=500, concession_percent=10, concession_amount=50,
            concession_reason="Approved concession", concession_granted_by=self.counter,
            concession_granted_at=timezone.now(), doctor_share_percent=50, doctor_share_amount=225,
            payment_status="Confirmed", payment_method="PAYTM_POS_MANUAL", payment_reference="PAYTM-RESCHEDULE-TEST",
        )
        client = APIClient(); client.force_authenticate(self.counter)
        response = client.patch(
            f"/api/appointments/{appointment.id}/",
            {"action": "reschedule", "date": new_date.isoformat(), "time": "09:15", "reason": "Doctor unavailable"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        replacement = Appointment.objects.get(pk=response.data["id"])
        appointment.refresh_from_db()
        self.assertEqual(appointment.status, Appointment.Status.RESCHEDULED)
        self.assertEqual(appointment.payment_status, "Transferred")
        self.assertEqual(appointment.payment_method, "TRANSFERRED")
        self.assertEqual(replacement.rescheduled_from, appointment)
        self.assertEqual(replacement.payment_status, "Confirmed")
        self.assertEqual(replacement.payment_method, "PAYTM_POS_MANUAL")
        self.assertEqual(replacement.payment_reference, "PAYTM-RESCHEDULE-TEST")
        self.assertEqual(replacement.base_consultation_fee, 500)
        self.assertEqual(replacement.concession_amount, 50)
        self.assertEqual(replacement.doctor_share_amount, 225)

    def test_counter_registration_creates_patient_id_and_daily_token(self):
        client = APIClient(); client.force_authenticate(self.counter)
        response = client.post("/api/registrations/", {"name":"Camp Patient", "phoneNo":"9903554604", "address":"Kolkata", "age":35, "gender":"MALE", "departmentId":str(self.department.id)}, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.data["patientId"].startswith("BHCC"))
        self.assertEqual(response.data["tokenNumber"], "DEN-001")
        self.assertEqual(LabRegistration.objects.get().fee, 0)

    def test_counter_can_set_password_only_for_a_new_patient(self):
        client = APIClient(); client.force_authenticate(self.counter)
        payload = {"name":"Portal Patient", "phoneNo":"9903554690", "address":"Kolkata", "age":35, "gender":"MALE", "departmentId":str(self.department.id), "portalPassword":"Secure-patient-password-95"}
        created = client.post("/api/registrations/", payload, format="json")
        self.assertEqual(created.status_code, 201)
        patient = LabRegistration.objects.get(pk=created.data["id"]).patient
        self.assertTrue(patient.check_password("Secure-patient-password-95"))

        payload["existingPatientId"] = str(patient.id)
        payload["portalPassword"] = "Replacement-password-96"
        rejected = client.post("/api/registrations/", payload, format="json")
        self.assertEqual(rejected.status_code, 409)
        patient.refresh_from_db()
        self.assertTrue(patient.check_password("Secure-patient-password-95"))

    def test_counter_concession_is_audited_and_doctor_gets_half_of_net_fee(self):
        client = APIClient(); client.force_authenticate(self.counter)
        response = client.post("/api/appointments/", {
            "patientId": str(self.patient.id), "patientName": "Patient",
            "doctorId": str(self.doctor.id), "doctorName": "Doctor", "department": "Dental",
            "date": date.today() + timedelta(days=3), "time": "11:00", "fee": 1,
            "concessionPercent": 20, "concessionReason": "Approved community concession",
        }, format="json")
        self.assertEqual(response.status_code, 201)
        appointment = Appointment.objects.get(pk=response.data["id"])
        self.assertEqual(appointment.base_consultation_fee, 500)
        self.assertEqual(appointment.concession_amount, 100)
        self.assertEqual(appointment.fee, 400)
        self.assertEqual(appointment.doctor_share_percent, 50)
        self.assertEqual(appointment.doctor_share_amount, 200)
        self.assertEqual(appointment.concession_granted_by, self.counter)
        self.assertIsNotNone(appointment.concession_granted_at)

    def test_counter_can_grant_up_to_full_concession_but_must_supply_reason(self):
        client = APIClient(); client.force_authenticate(self.counter)
        base = {"patientId":str(self.patient.id), "patientName":"Patient", "doctorId":str(self.doctor.id), "doctorName":"Doctor", "department":"Dental", "date":date.today()+timedelta(days=4), "time":"11:00"}
        full = client.post("/api/appointments/", {**base, "concessionPercent":100, "concessionReason":"Fully waived by clinic"}, format="json")
        self.assertEqual(full.status_code, 201)
        appointment = Appointment.objects.get(pk=full.data["id"])
        self.assertEqual(appointment.fee, 0)
        self.assertEqual(appointment.doctor_share_amount, 0)
        base["time"] = "11:15"
        self.assertEqual(client.post("/api/appointments/", {**base, "concessionPercent":101, "concessionReason":"Too high"}, format="json").status_code, 400)
        self.assertEqual(client.post("/api/appointments/", {**base, "concessionPercent":10}, format="json").status_code, 400)

    def test_counter_can_reset_patient_password_but_not_staff_password(self):
        client = APIClient(); client.force_authenticate(self.counter)
        response = client.post(f"/api/management/accounts/{self.patient.id}/reset-password/", {"password":"New-secure-patient-password-95"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.patient.refresh_from_db()
        self.assertTrue(self.patient.check_password("New-secure-patient-password-95"))
        forbidden = client.post(f"/api/management/accounts/{self.doctor.id}/reset-password/", {"password":"New-secure-doctor-password-95"}, format="json")
        self.assertEqual(forbidden.status_code, 403)

    def test_counter_can_record_a_missed_past_consultation_and_payment(self):
        client = APIClient(); client.force_authenticate(self.counter)
        yesterday = date.today() - timedelta(days=1)
        response = client.post("/api/appointments/", {
            "patientId":str(self.patient.id), "patientName":"Patient", "doctorId":str(self.doctor.id), "doctorName":"Doctor",
            "department":"Dental", "date":yesterday, "time":"11:00", "recordedAfterService":True,
            "historicalEntryReason":"Consultation completed yesterday but counter entry was missed",
        }, format="json")
        self.assertEqual(response.status_code, 201)
        appointment = Appointment.objects.get(pk=response.data["id"])
        self.assertEqual(appointment.status, Appointment.Status.COMPLETED)
        self.assertTrue(appointment.recorded_after_service)
        self.assertEqual(appointment.historical_entry_by, self.counter)
        paid = client.patch(f"/api/appointments/{appointment.id}/manual-pos-payment/", {"method":"CASH"}, format="json")
        self.assertEqual(paid.status_code, 200)
        self.assertEqual(paid.data["paymentStatus"], "Confirmed")

    def test_counter_can_correct_paid_no_show_to_completed_with_reason(self):
        appointment = Appointment.objects.create(
            patient=self.patient, doctor=self.doctor, patient_name="Patient", doctor_name="Doctor", department="Dental",
            date=date.today()-timedelta(days=1), time="12:00", fee=500, base_consultation_fee=500,
            doctor_share_amount=250, status=Appointment.Status.NO_SHOW, payment_status="Confirmed", payment_method="CASH",
        )
        client = APIClient(); client.force_authenticate(self.counter)
        missing_reason = client.patch(f"/api/appointments/{appointment.id}/", {"action":"mark_consulted"}, format="json")
        self.assertEqual(missing_reason.status_code, 400)
        corrected = client.patch(f"/api/appointments/{appointment.id}/", {"action":"mark_consulted", "reason":"Patient was consulted; completion was missed"}, format="json")
        self.assertEqual(corrected.status_code, 200)
        self.assertEqual(corrected.data["status"], "Completed")

    def test_registration_requires_demographics_and_existing_lookup_prefills(self):
        client = APIClient(); client.force_authenticate(self.counter)
        invalid = client.post("/api/registrations/", {"name":"Missing Details", "phoneNo":"9903554680", "departmentId":str(self.department.id)}, format="json")
        self.assertEqual(invalid.status_code, 400)
        created = client.post("/api/registrations/", {"name":"Existing Patient", "phoneNo":"9903554680", "address":"Newtown", "age":31, "gender":"FEMALE", "departmentId":str(self.department.id)}, format="json")
        self.assertEqual(created.status_code, 201)
        lookup = client.get("/api/registrations/patient-lookup/?phone=9903554680&name=Existing%20Patient")
        self.assertEqual(lookup.status_code, 200)
        self.assertTrue(lookup.data[0]["exactMatch"])
        self.assertEqual(lookup.data[0]["age"], 31)
        self.assertEqual(lookup.data[0]["gender"], "FEMALE")

        search = client.get("/api/registrations/patient-lookup/?q=Existing")
        self.assertEqual(search.status_code, 200)
        self.assertEqual(search.data[0]["patientId"], created.data["patientId"])

    def test_counter_and_admin_can_correct_registration_details(self):
        client = APIClient(); client.force_authenticate(self.counter)
        created = client.post("/api/registrations/", {"name":"Wrong Name", "phoneNo":"9903554681", "address":"Old address", "age":30, "gender":"MALE", "departmentId":str(self.department.id)}, format="json")
        self.assertEqual(created.status_code, 201)
        response = client.patch(f"/api/registrations/{created.data['id']}/", {"name":"Correct Name", "phoneNo":"9903554682", "address":"Correct address", "age":32, "gender":"FEMALE"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["name"], "Correct Name")
        profile = UserProfile.objects.get(user_id=LabRegistration.objects.get(pk=created.data["id"]).patient_id)
        self.assertEqual(profile.phone_no, "9903554682")
        self.assertEqual(profile.age, 32)
        self.assertEqual(profile.gender, "FEMALE")

        client.force_authenticate(self.admin)
        response = client.patch(f"/api/registrations/{created.data['id']}/", {"address":"Admin corrected address"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["address"], "Admin corrected address")

    def test_admin_generates_and_confirms_payroll(self):
        client = APIClient(); client.force_authenticate(self.admin)
        month = date.today().strftime("%Y-%m")
        response = client.post("/api/management/payroll/", {"month":month}, format="json")
        self.assertEqual(response.status_code, 200)
        row = PayrollRecord.objects.get(employee=self.doctor)
        response = client.patch(f"/api/management/payroll/{row.id}/", {"status":"PAID", "paymentMethod":"Bank transfer", "reference":"TEST-1"}, format="json")
        self.assertEqual(response.status_code, 200)
        row.refresh_from_db()
        self.assertEqual(row.status, PayrollRecord.Status.PAID)
        self.assertEqual(row.confirmed_by, self.admin)

    def test_admin_selects_departments_and_counter_receipt_has_minimal_fields(self):
        admin_client = APIClient(); admin_client.force_authenticate(self.admin)
        response = admin_client.post("/api/free-camps/", {"name":"Community Camp", "date":(date.today()+timedelta(days=1)).isoformat(), "departmentIds":[str(self.department.id)]}, format="json")
        self.assertEqual(response.status_code, 201)
        camp_id = response.data["id"]
        self.assertEqual(admin_client.patch(f"/api/free-camps/{camp_id}/", {"status":"OPEN"}, format="json").status_code, 200)

        counter_client = APIClient(); counter_client.force_authenticate(self.counter)
        DoctorAvailability.objects.create(doctor=self.doctor, date=date.today()+timedelta(days=1), slots=["10:00"])
        response = counter_client.post("/api/registrations/", {"name":"Camp Patient", "phoneNo":"9903554605", "address":"Newtown", "age":28, "gender":"FEMALE", "departmentId":str(self.department.id), "campId":camp_id, "doctorId":str(self.doctor.id), "time":"10:00", "isFreeCamp":True}, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(set(["name", "phoneNo", "patientId", "departmentName", "tokenNumber"]) - set(response.data), set())
        self.assertNotIn("roomNumber", response.data)
        self.assertNotIn("doctorName", response.data)
        camp_registration = CampRegistration.objects.get(registration_id=response.data["id"])
        self.assertEqual(camp_registration.registered_by, self.counter)
        dashboard = admin_client.get("/api/free-camps/")
        self.assertEqual(dashboard.status_code, 200)
        camp_summary = next(row for row in dashboard.data if row["id"] == str(camp_id))
        self.assertEqual(camp_summary["registrationCount"], 1)
        self.assertEqual(camp_summary["departmentStats"], [{"departmentId": str(self.department.id), "departmentName": "Dental", "patientCount": 1}])
        self.assertEqual(counter_client.post(f"/api/registrations/{response.data['id']}/receipt-print/").status_code, 200)
        camp_registration.refresh_from_db(); self.assertEqual(camp_registration.receipt_print_count, 1)

    def test_admin_can_edit_and_delete_only_empty_camps(self):
        client = APIClient(); client.force_authenticate(self.admin)
        camp = FreeCamp.objects.create(name="Draft Camp", date=date.today()+timedelta(days=1), created_by=self.admin)
        response = client.patch(f"/api/free-camps/{camp.id}/", {"name":"Updated Camp", "location":"New Location", "capacity":20}, format="json")
        self.assertEqual(response.status_code, 200)
        camp.refresh_from_db()
        self.assertEqual(camp.name, "Updated Camp")
        self.assertEqual(camp.capacity, 20)
        self.assertEqual(client.delete(f"/api/free-camps/{camp.id}/").status_code, 204)
        self.assertFalse(FreeCamp.objects.filter(pk=camp.id).exists())

        protected_camp = FreeCamp.objects.create(name="Protected Camp", date=date.today()+timedelta(days=1), created_by=self.admin)
        protected_camp.departments.add(self.department)
        registration = LabRegistration.objects.create(name="Protected Patient", phone_no="9903554699", department=self.department, is_free_camp=True)
        CampRegistration.objects.create(camp=protected_camp, registration=registration, registered_by=self.counter)
        response = client.delete(f"/api/free-camps/{protected_camp.id}/")
        self.assertEqual(response.status_code, 409)
        self.assertTrue(FreeCamp.objects.filter(pk=protected_camp.id).exists())

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_online_registration_reuses_counter_patient_id(self):
        counter_client = APIClient(); counter_client.force_authenticate(self.counter)
        created = counter_client.post("/api/registrations/", {"name":"Linked Patient", "phoneNo":"9903554606", "address":"Kolkata", "age":40, "gender":"MALE", "departmentId":str(self.department.id)}, format="json")
        self.assertEqual(created.status_code, 201)
        patient_id = created.data["patientId"]
        response = APIClient().post("/api/auth/register-patient/", {
            "name":"Linked Patient", "email":"linked@example.com", "password":"Linked-safe-password-42",
            "address":"Newtown", "phoneNo":"9903554606", "profession":"Teacher", "annualIncomeRange":"1-5 Lakhs",
            "religion":"Hindu", "acceptPolicies":True,
        }, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(UserProfile.objects.get(user__username="linked@example.com").patient_id, patient_id)
        self.assertEqual(UserProfile.objects.filter(phone_no="9903554606").count(), 1)

    def test_shared_mobile_can_create_separate_patient_only_when_confirmed(self):
        first = User.objects.create_user(username="family-one")
        UserProfile.objects.create(user=first, role=UserRole.PATIENT, name="Family One", phone_no="9903554607", patient_id="BHCC900000001")
        client = APIClient(); client.force_authenticate(self.counter)
        payload = {"name":"Family Two", "phoneNo":"9903554607", "address":"Kolkata", "age":22, "gender":"FEMALE", "departmentId":str(self.department.id)}
        self.assertEqual(client.post("/api/registrations/", payload, format="json").status_code, 409)
        payload["createSeparatePatient"] = True
        response = client.post("/api/registrations/", payload, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertNotEqual(response.data["patientId"], "BHCC900000001")


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend", DEFAULT_FROM_EMAIL="Bhaktivedanta Healthcare <noreply@bhaktivedantahealthcare.tech>", SUPPORT_EMAIL="support@bhaktivedantahealthcare.tech", FRONTEND_URL="https://example.test")
class ClinicalWorkflowTests(TestCase):
    def setUp(self) -> None:
        self.patient = User.objects.create_user(username="patient-id@example.com", email="patient-id@example.com", password="safe-test-password")
        self.patient_profile = UserProfile.objects.create(user=self.patient, role=UserRole.PATIENT, name="Patient")
        self.doctor = User.objects.create_user(username="rx-doctor@example.com", email="rx-doctor@example.com", password="safe-test-password")
        UserProfile.objects.create(user=self.doctor, role=UserRole.DOCTOR, name="Doctor", specialty="Medicine", qualification="MBBS", medical_registration_number="WB-123", registration_council="WBMC")
        self.admin = User.objects.create_user(username="admin-clinical@example.com", password="safe-test-password")
        UserProfile.objects.create(user=self.admin, role=UserRole.ADMIN, name="Admin")
        self.appointment = Appointment.objects.create(patient=self.patient, doctor=self.doctor, patient_name="Patient", doctor_name="Doctor", department="Medicine", date=date.today(), time="10:00", fee=500)

    def test_patient_id_is_sequential_and_can_be_used_to_login(self) -> None:
        self.assertEqual(allocate_patient_id(self.patient_profile), "BHCC000000001")
        second = User.objects.create_user(username="second@example.com", password="safe-test-password")
        second_profile = UserProfile.objects.create(user=second, role=UserRole.PATIENT)
        self.assertEqual(allocate_patient_id(second_profile), "BHCC000000002")
        response = APIClient().post("/api/auth/login/", {"email": "BHCC000000001", "password": "safe-test-password"}, format="json")
        self.assertEqual(response.status_code, 200)

    @override_settings(GOOGLE_CLIENT_ID="google-client-id.apps.googleusercontent.com")
    @patch("google.oauth2.id_token.verify_oauth2_token")
    def test_google_login_creates_verified_patient_with_bhcc_id(self, verify_token) -> None:
        verify_token.return_value = {"email": "google.patient@example.com", "name": "Google Patient", "email_verified": True}
        response = APIClient().post("/api/auth/google/", {"credential": "signed-google-id-token", "acceptPolicies": True}, format="json")
        self.assertEqual(response.status_code, 200)
        profile = UserProfile.objects.get(user__username="google.patient@example.com")
        self.assertEqual(profile.role, UserRole.PATIENT)
        self.assertTrue(profile.patient_id.startswith("BHCC"))
        self.assertIsNotNone(profile.email_verified_at)
        self.assertIn("access", response.data)

    @override_settings(GOOGLE_CLIENT_ID="google-client-id.apps.googleusercontent.com")
    @patch("google.oauth2.id_token.verify_oauth2_token")
    def test_google_login_cannot_use_staff_email_in_patient_portal(self, verify_token) -> None:
        verify_token.return_value = {"email": self.doctor.email, "name": "Doctor", "email_verified": True}
        response = APIClient().post("/api/auth/google/", {"credential": "signed-google-id-token", "acceptPolicies": True}, format="json")
        self.assertEqual(response.status_code, 403)

    def test_attendance_and_admin_correction_create_audit_record(self) -> None:
        client = APIClient(); client.force_authenticate(self.doctor)
        response = client.post("/api/attendance/", {"action": "CHECK_IN"}, format="json")
        self.assertEqual(response.status_code, 200)
        row = AttendanceRecord.objects.get(employee=self.doctor)
        client.force_authenticate(self.admin)
        response = client.patch(f"/api/admin/attendance/{row.pk}/", {"status": "PRESENT", "adminNotes": "Approved correction", "reason": "Clock discrepancy"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(AttendanceAuditLog.objects.filter(attendance=row, changed_by=self.admin).exists())

    def test_doctor_finalizes_prescription_and_patient_can_download_pdf(self) -> None:
        client = APIClient(); client.force_authenticate(self.doctor)
        follow_up_date = date.today() + timedelta(days=7)
        response = client.put(f"/api/appointments/{self.appointment.pk}/prescription/", {"diagnosis": "Seasonal allergy", "followUpDate": follow_up_date.isoformat(), "medicines": [{"name": "Cetirizine", "dose": "1 tablet", "frequency": "Night", "duration": "5 days"}], "tests": []}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["followUpDate"], follow_up_date.isoformat())
        prescription_id = response.data["id"]
        response = client.post(f"/api/prescriptions/{prescription_id}/finalize/", {}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(Prescription.objects.get(pk=prescription_id).status, Prescription.Status.FINALIZED)
        client.force_authenticate(self.patient)
        self.assertEqual(client.get("/api/prescriptions/").status_code, 200)
        pdf = client.get(f"/api/prescriptions/{prescription_id}/pdf/")
        self.assertEqual(pdf.status_code, 200)
        self.assertEqual(pdf["Content-Type"], "application/pdf")

        client.force_authenticate(self.admin)
        self.assertEqual(client.get("/api/prescriptions/").status_code, 200)
        self.assertEqual(client.get(f"/api/prescriptions/{prescription_id}/pdf/").status_code, 200)

    def test_prescription_rejects_invalid_follow_up_date(self) -> None:
        client = APIClient(); client.force_authenticate(self.doctor)
        response = client.put(
            f"/api/appointments/{self.appointment.pk}/prescription/",
            {"diagnosis": "Seasonal allergy", "followUpDate": "not-a-date"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("followUpDate", response.data)

    def test_admin_can_list_all_profiles_and_clinical_history_blocks_deletion(self) -> None:
        client = APIClient(); client.force_authenticate(self.admin)
        response = client.get("/api/management/accounts/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual({row["role"] for row in response.data}, {UserRole.ADMIN, UserRole.DOCTOR, UserRole.PATIENT})
        response = client.delete(f"/api/management/accounts/{self.doctor.pk}/")
        self.assertEqual(response.status_code, 409)
        response = client.patch(f"/api/management/accounts/{self.doctor.pk}/", {"isActive": False}, format="json")
        self.assertEqual(response.status_code, 200)
        self.doctor.refresh_from_db()
        self.assertFalse(self.doctor.is_active)
        response = client.post(f"/api/management/accounts/{self.doctor.pk}/reset-password/", {"password": "New-safe-doctor-password-42"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.doctor.refresh_from_db()
        self.assertTrue(self.doctor.is_active)
        self.assertTrue(self.doctor.check_password("New-safe-doctor-password-42"))
        response = client.delete(f"/api/management/accounts/{self.doctor.pk}/", {"purgeClinicalRecords": True, "confirmation": f"DELETE {self.doctor.email}"}, format="json")
        self.assertEqual(response.status_code, 204)
        self.assertFalse(User.objects.filter(pk=self.doctor.pk).exists())
        self.assertFalse(Appointment.objects.filter(pk=self.appointment.pk).exists())


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
        self.assertEqual(mail.outbox[0].subject, "BHCC admin login code")
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
            payment_method="CASH",
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
        self.assertEqual(response.data["cancelledToday"], 0)
        self.assertEqual(response.data["refundsPending"], 0)
        self.assertEqual(response.data["activeDoctors"], 1)
        self.assertEqual(response.data["grossRevenue"], 750)
        self.assertEqual(response.data["cashRevenue"], 750)
        self.assertEqual(response.data["onlineRevenue"], 0)
        self.assertEqual(response.data["currentWeekAppointments"], 1)
        self.assertEqual(response.data["completedToday"], 1)
        self.assertEqual(response.data["weeklyGrowthPercent"], 0.0)
        self.assertEqual(len(response.data["recentAppointments"]), 2)

    def test_non_admin_cannot_access_dashboard_summary(self) -> None:
        self.client.force_authenticate(self.patient)
        response = self.client.get("/api/admin/dashboard/")
        self.assertEqual(response.status_code, 403)

    def test_cancelled_appointment_is_removed_from_active_overview_count(self) -> None:
        today = timezone.localdate()
        Appointment.objects.create(
            patient=self.patient, doctor=self.doctor, patient_name="Cancelled Patient", doctor_name="Live Doctor",
            department="Dental", date=today, time="12:00", fee=500,
            status=Appointment.Status.CANCELLED, payment_status="Refund Pending",
            payment_method="CASH", refund_status="Pending", refund_method="CASH", refund_amount=500,
        )
        response = self.client.get("/api/management/dashboard/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["appointmentsToday"], 0)
        self.assertEqual(response.data["cancelledToday"], 1)
        self.assertEqual(response.data["refundsPending"], 1)
        self.assertEqual(response.data["grossRevenue"], 0)

    def test_admin_can_edit_patient_and_doctor_profile_details(self) -> None:
        response = self.client.patch(
            f"/api/management/accounts/{self.patient.id}/",
            {"name": "Corrected Patient", "phoneNo": "9903554604", "address": "New address", "age": 42, "gender": "FEMALE"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["name"], "Corrected Patient")
        self.assertEqual(response.data["patientProfile"]["age"], 42)
        self.assertEqual(response.data["patientProfile"]["gender"], "FEMALE")

        response = self.client.patch(
            f"/api/management/accounts/{self.doctor.id}/",
            {"department": "Cardiology", "specialty": "Interventional Cardiology", "fee": 900},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["department"], "Cardiology")
        self.assertEqual(response.data["fee"], 900)

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

    def test_admin_can_delete_staff_but_not_their_own_account(self) -> None:
        counter = User.objects.create_user(username="counter-delete@example.com", email="counter-delete@example.com", password="counter-password")
        UserProfile.objects.create(user=counter, role=UserRole.COUNTER, name="Delete Counter")

        response = self.client.delete(f"/api/admin/accounts/{counter.id}/")
        self.assertEqual(response.status_code, 204)
        self.assertFalse(User.objects.filter(pk=counter.id).exists())

        own_response = self.client.delete(f"/api/admin/accounts/{self.admin.id}/")
        self.assertEqual(own_response.status_code, 400)
        self.assertTrue(User.objects.filter(pk=self.admin.id).exists())

    def test_admin_staff_list_excludes_patients_and_doctors(self) -> None:
        response = self.client.get("/api/admin/staff-accounts/")
        self.assertEqual(response.status_code, 200)
        returned_ids = {row["id"] for row in response.data}
        self.assertIn(str(self.admin.id), returned_ids)
        self.assertNotIn(str(self.patient.id), returned_ids)
        self.assertNotIn(str(self.doctor.id), returned_ids)


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

    def test_password_reset_confirm_without_trailing_slash_does_not_redirect(self) -> None:
        response = self.client.post(
            "/api/auth/password-reset/confirm",
            {"uid": "invalid", "token": "invalid", "password": "Safe-password-98"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

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
