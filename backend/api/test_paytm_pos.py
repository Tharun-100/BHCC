import os
import socket
import ssl
from datetime import date
from io import StringIO
from unittest.mock import patch

from django.contrib.auth.models import User
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import SimpleTestCase, TestCase
from rest_framework.test import APIClient

from .models import Appointment, UserProfile, UserRole
from .paytm_pos import PaytmPosError, _settings, connection_error, result_info


class PaytmProtocolTests(SimpleTestCase):
    def test_documented_short_statuses_and_result_codes(self):
        for info, expected in [
            ({"resultStatus": "A", "resultCode": "ACCEPTED_SUCCESS"}, "ACCEPTED_SUCCESS"),
            ({"resultStatus": "S"}, "SUCCESS"),
            ({"resultStatus": "01", "resultCode": "SUCCESS"}, "SUCCESS"),
            ({"resultStatus": "U"}, "PENDING"),
            ({"resultStatus": "F"}, "FAIL"),
        ]:
            self.assertEqual(result_info({"body": {"resultInfo": info}})[0], expected)

    def test_terminal_error_includes_code_and_next_step(self):
        status, message = result_info({"body": {"resultInfo": {"resultStatus": "F", "resultCodeId": "0007", "resultMsg": "Terminal is not active"}}})
        self.assertEqual(status, "FAIL")
        self.assertIn("0007", message)
        self.assertIn("activation", message)

    def test_network_failures_have_distinct_messages(self):
        self.assertIn("DNS", connection_error(socket.gaierror()))
        self.assertIn("TLS", connection_error(ssl.SSLError()))
        self.assertIn("timed out", connection_error(TimeoutError()))

    @patch.dict(os.environ, {"PAYTM_POS_ENABLED": "true", "PAYTM_POS_MID": "", "PAYTM_POS_MERCHANT_KEY": "secret-not-printed", "PAYTM_POS_CHANNEL_ID": "test", "PAYTM_POS_TERMINAL_ID": "12345678"})
    def test_missing_configuration_identifies_variable_without_secret(self):
        with self.assertRaises(PaytmPosError) as error:
            _settings()
        self.assertIn("PAYTM_POS_MID", str(error.exception))
        self.assertNotIn("secret-not-printed", str(error.exception))

    @patch("api.management.commands.check_paytm_pos._settings", side_effect=PaytmPosError("Missing PAYTM_POS_MID"))
    @patch("api.management.commands.check_paytm_pos.socket.create_connection")
    def test_diagnostic_configuration_failure_never_contacts_paytm(self, connect, config):
        with self.assertRaises(CommandError):
            call_command("check_paytm_pos", network=True, stdout=StringIO())
        connect.assert_not_called()


class PaytmAppointmentTests(TestCase):
    def setUp(self):
        counter = User.objects.create_user(username="pos-counter")
        UserProfile.objects.create(user=counter, role=UserRole.COUNTER)
        doctor = User.objects.create_user(username="pos-doctor")
        patient = User.objects.create_user(username="pos-patient")
        self.appointment = Appointment.objects.create(patient=patient, doctor=doctor, fee=500, date=date.today(), time="10:00")
        self.client = APIClient()
        self.client.force_authenticate(counter)

    @patch("api.paytm_pos.initiate_sale")
    def test_accepted_short_response_stores_request_for_status_check(self, sale):
        sale.return_value = {"request": {"transactionDateTime": "2026-10-13 10:00:00"}, "response": {"body": {"resultInfo": {"resultStatus": "A", "resultCode": "ACCEPTED_SUCCESS"}}}}
        response = self.client.post(f"/api/appointments/{self.appointment.pk}/paytm-pos/initiate/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["paymentStatus"], "Pending at POS")

    @patch("api.paytm_pos.enquire_status")
    def test_short_success_requires_exact_amount(self, enquire):
        self.appointment.payment_method = "PAYTM_POS_AUTOMATIC"
        self.appointment.payment_reference = "BHCC1234567890"
        self.appointment.save()
        for amount in [None, "100", "50000"]:
            body = {"resultInfo": {"resultStatus": "S", "resultCode": "SUCCESS"}}
            if amount is not None:
                body["transactionAmount"] = amount
            enquire.return_value = {"body": body}
            response = self.client.post(f"/api/appointments/{self.appointment.pk}/paytm-pos/status/")
            self.assertEqual(response.status_code, 200 if amount == "50000" else 409)
        self.appointment.refresh_from_db()
        self.assertEqual(self.appointment.collected_amount, 500)
