from datetime import date

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient

from .models import Appointment, DentalProcedure, Department, UserProfile, UserRole


class ProcedureBillingTests(TestCase):
    def setUp(self):
        self.users = {}
        for role in [UserRole.ADMIN, UserRole.COUNTER, UserRole.DOCTOR, UserRole.PATIENT]:
            user = User.objects.create_user(username=role)
            UserProfile.objects.create(user=user, role=role, department="General", fee=500)
            self.users[role] = user
        Department.objects.create(name="General")
        self.procedure = DentalProcedure.objects.create(department="General", name="Dressing", charge=800)
        self.appointment = Appointment.objects.create(patient=self.users[UserRole.PATIENT], doctor=self.users[UserRole.DOCTOR], department="General", date=date.today(), time="10:00", fee=400, base_consultation_fee=500, concession_amount=100, status="InConsultation")
        self.client = APIClient()
        self.url = f"/api/appointments/{self.appointment.pk}/procedures/"

    def save_items(self, role, items):
        self.client.force_authenticate(self.users[role])
        return self.client.put(self.url, {"items": items}, format="json")

    def item(self, charge=700):
        return {"procedureId": str(self.procedure.pk), "charge": charge}

    def test_doctor_custom_price_in_any_department_preserves_consultation(self):
        result = self.save_items(UserRole.DOCTOR, [self.item()])
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.data["total"], 1100)
        self.assertEqual(result.data["appointment"]["doctorShareAmount"], 550)
        self.assertEqual(result.data["appointment"]["balanceDue"], 1100)
        self.procedure.refresh_from_db()
        self.assertEqual(self.procedure.charge, 800)

    def test_counter_edits_completed_paid_bill_and_collects_only_balance(self):
        self.appointment.status = "Completed"
        self.appointment.payment_status = "Confirmed"
        self.appointment.collected_amount = 400
        self.appointment.save()
        result = self.save_items(UserRole.COUNTER, [self.item()])
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.data["appointment"]["balanceDue"], 700)
        payment = self.client.patch(f"/api/appointments/{self.appointment.pk}/manual-pos-payment/", {"method": "CASH"}, format="json")
        self.assertEqual(payment.status_code, 200)
        self.assertEqual(payment.data["collectedAmount"], 1100)
        result = self.save_items(UserRole.ADMIN, [])
        self.assertEqual(result.data["total"], 400)
        self.assertEqual(result.data["appointment"]["doctorShareAmount"], 200)
        self.assertEqual(result.data["appointment"]["overpaidAmount"], 700)
        overview = self.client.get("/api/admin/dashboard/")
        self.assertEqual(overview.data["grossRevenue"], 1100)
        self.assertEqual(overview.data["procedureCharges"], 0)

    def test_patient_and_other_doctor_cannot_edit(self):
        self.assertEqual(self.save_items(UserRole.PATIENT, [self.item()]).status_code, 403)
        other = User.objects.create_user(username="other-doctor")
        UserProfile.objects.create(user=other, role=UserRole.DOCTOR)
        self.client.force_authenticate(other)
        self.assertEqual(self.client.put(self.url, {"items": []}, format="json").status_code, 403)

    def test_doctor_cannot_edit_completed_appointment(self):
        self.appointment.status = "Completed"
        self.appointment.save()
        self.assertEqual(self.save_items(UserRole.DOCTOR, []).status_code, 409)

    def test_wrong_department_and_invalid_charges_leave_bill_unchanged(self):
        wrong = DentalProcedure.objects.create(name="Scaling", department="Dental", charge=900)
        for items in [[{"procedureId": str(wrong.pk), "charge": 900}], [self.item(-1)], [self.item(1.5)], [self.item(), self.item()], [self.item(True)]]:
            self.assertEqual(self.save_items(UserRole.ADMIN, items).status_code, 400)
        self.appointment.refresh_from_db()
        self.assertEqual(self.appointment.fee, 400)
        self.assertFalse(self.appointment.procedure_charges.exists())

    def test_catalog_change_does_not_change_existing_price(self):
        self.save_items(UserRole.ADMIN, [self.item()])
        self.procedure.charge = 1000
        self.procedure.is_active = False
        self.procedure.save()
        result = self.save_items(UserRole.COUNTER, [{"procedureId": str(self.procedure.pk)}])
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.data["items"][0]["charge"], 700)

    def test_free_follow_up_stays_free_when_procedures_removed(self):
        self.appointment.fee = 0
        self.appointment.save()
        self.save_items(UserRole.ADMIN, [self.item()])
        self.assertEqual(self.save_items(UserRole.ADMIN, []).data["total"], 0)

    def test_catalog_department_validation_and_duplicate_names(self):
        self.client.force_authenticate(self.users[UserRole.ADMIN])
        payload = {"name": "Dressing", "charge": 800, "department": "General"}
        self.assertEqual(self.client.post("/api/dental-procedures/", payload, format="json").status_code, 400)
        Department.objects.create(name="Dental")
        payload["department"] = "Dental"
        response = self.client.post("/api/dental-procedures/", payload, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["department"], "Dental")
        payload["department"] = "Missing"
        self.assertEqual(self.client.post("/api/dental-procedures/", payload, format="json").status_code, 400)

    def test_cancelled_bill_cannot_be_edited(self):
        self.appointment.status = "Cancelled"
        self.appointment.save()
        self.assertEqual(self.save_items(UserRole.ADMIN, [self.item()]).status_code, 409)
