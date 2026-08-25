from __future__ import annotations

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient

from api.models import UserProfile, UserRole
from .models import GroupMembership, ServiceCategory, ServiceGroup, WeeklyServiceReport


class ReportingWorkflowTests(TestCase):
    def setUp(self):
        self.member = User.objects.create_user("member@example.com", email="member@example.com", password="test-password")
        UserProfile.objects.create(user=self.member, role=UserRole.STAFF, name="Member")
        self.other = User.objects.create_user("other@example.com", email="other@example.com", password="test-password")
        UserProfile.objects.create(user=self.other, role=UserRole.DOCTOR, name="Other Member")
        self.leader = User.objects.create_user("leader@example.com", email="leader@example.com", password="test-password")
        UserProfile.objects.create(user=self.leader, role=UserRole.STAFF, name="Leader")
        self.clinic_admin = User.objects.create_user("clinic-admin@example.com", email="clinic-admin@example.com", password="test-password")
        UserProfile.objects.create(user=self.clinic_admin, role=UserRole.ADMIN, name="Clinic Admin")
        self.group = ServiceGroup.objects.create(name="Newtown Service Group")
        self.member_membership = GroupMembership.objects.create(group=self.group, user=self.member)
        self.other_membership = GroupMembership.objects.create(group=self.group, user=self.other)
        self.leader_membership = GroupMembership.objects.create(group=self.group, user=self.leader, role=GroupMembership.Role.LEADER)
        self.category = ServiceCategory.objects.create(group=self.group, name="Community outreach")

    def client_for(self, user):
        client = APIClient(); client.force_authenticate(user); return client

    def test_clinic_admin_does_not_automatically_receive_reporting_access(self):
        response = self.client_for(self.clinic_admin).get("/api/reporting/me/")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["hasAccess"])

    def test_reporting_and_clinical_sessions_are_scope_isolated(self):
        client = APIClient()
        response = client.post("/api/reporting/auth/login/", {"email": self.member.email, "password": "test-password"}, format="json")
        self.assertEqual(response.status_code, 200)
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")
        self.assertEqual(client.get("/api/reporting/me/").status_code, 200)
        self.assertEqual(client.get("/api/auth/me/").status_code, 401)

        client = APIClient()
        response = client.post("/api/auth/login/", {"email": self.member.email, "password": "test-password"}, format="json")
        self.assertEqual(response.status_code, 200)
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")
        self.assertEqual(client.get("/api/reporting/me/").status_code, 401)

    def test_member_saves_and_submits_isolated_weekly_report(self):
        client = self.client_for(self.member)
        response = client.get(f"/api/reporting/reports/current/?membershipId={self.member_membership.pk}")
        self.assertEqual(response.status_code, 200)
        report_id = response.data["id"]
        response = client.put(f"/api/reporting/reports/{report_id}/", {
            "happiness": "The team worked together.", "challenges": "Need transport support.", "needsSupport": True,
            "appreciations": [{"recipientId": str(self.other_membership.pk), "reason": "Helped the team", "contribution": "Outreach"}],
            "tasks": [{"title": "Contact volunteers", "categoryId": str(self.category.pk), "priority": "HIGH", "status": "IN_PROGRESS"}],
        }, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["appreciations"]), 1)
        self.assertEqual(len(response.data["tasks"]), 1)
        response = client.post(f"/api/reporting/reports/{report_id}/submit/", {}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], WeeklyServiceReport.Status.SUBMITTED)
        self.assertEqual(client.put(f"/api/reporting/reports/{report_id}/", {"happiness": "Changed"}, format="json").status_code, 409)

    def test_leader_can_review_but_cannot_silently_edit_member_report(self):
        period = self._period()
        report = WeeklyServiceReport.objects.get(period=period, membership=self.member_membership)
        report.happiness = "Good week"
        report.status = WeeklyServiceReport.Status.SUBMITTED
        report.save()
        client = self.client_for(self.leader)
        self.assertEqual(client.get(f"/api/reporting/group/reports/?membershipId={self.leader_membership.pk}").status_code, 200)
        self.assertEqual(client.put(f"/api/reporting/reports/{report.pk}/", {"happiness": "Leader edit"}, format="json").status_code, 403)
        self.assertEqual(client.post(f"/api/reporting/reports/{report.pk}/feedback/", {"comment": "Thank you."}, format="json").status_code, 201)
        self.assertEqual(client.post(f"/api/reporting/reports/{report.pk}/reopen/", {}, format="json").status_code, 200)

    def test_member_cannot_appreciate_self(self):
        response = self.client_for(self.member).get(f"/api/reporting/reports/current/?membershipId={self.member_membership.pk}")
        report_id = response.data["id"]
        response = self.client_for(self.member).put(f"/api/reporting/reports/{report_id}/", {"appreciations": [{"recipientId": str(self.member_membership.pk), "reason": "Self"}]}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_group_admin_enrolls_existing_account_without_changing_clinical_profile(self):
        self.leader_membership.role = GroupMembership.Role.ADMIN
        self.leader_membership.save(update_fields=["role"])
        client = self.client_for(self.leader)
        response = client.post("/api/reporting/group/manage/", {
            "membershipId": str(self.leader_membership.pk), "action": "ADD_MEMBER",
            "email": self.clinic_admin.email, "role": "MEMBER",
        }, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(GroupMembership.objects.filter(group=self.group, user=self.clinic_admin).exists())
        self.clinic_admin.profile.refresh_from_db()
        self.assertEqual(self.clinic_admin.profile.role, UserRole.ADMIN)

    def _period(self):
        response = self.client_for(self.member).get(f"/api/reporting/reports/current/?membershipId={self.member_membership.pk}")
        return WeeklyServiceReport.objects.get(pk=response.data["id"]).period
