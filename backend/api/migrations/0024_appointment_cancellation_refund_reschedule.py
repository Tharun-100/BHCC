from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


def backfill_consultation_financials(apps, schema_editor):
    Appointment = apps.get_model("api", "Appointment")
    for appointment in Appointment.objects.all().iterator():
        appointment.base_consultation_fee = appointment.fee
        appointment.doctor_share_percent = 50
        appointment.doctor_share_amount = appointment.fee // 2
        appointment.save(update_fields=["base_consultation_fee", "doctor_share_percent", "doctor_share_amount"])


class Migration(migrations.Migration):
    dependencies = [
        ("api", "0023_appointment_follow_up_of"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(model_name="appointment", name="base_consultation_fee", field=models.PositiveIntegerField(default=0)),
        migrations.AddField(model_name="appointment", name="concession_percent", field=models.PositiveSmallIntegerField(default=0)),
        migrations.AddField(model_name="appointment", name="concession_amount", field=models.PositiveIntegerField(default=0)),
        migrations.AddField(model_name="appointment", name="concession_reason", field=models.TextField(blank=True, default="")),
        migrations.AddField(model_name="appointment", name="concession_granted_at", field=models.DateTimeField(blank=True, null=True)),
        migrations.AddField(model_name="appointment", name="concession_granted_by", field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="granted_appointment_concessions", to=settings.AUTH_USER_MODEL)),
        migrations.AddField(model_name="appointment", name="doctor_share_percent", field=models.PositiveSmallIntegerField(default=50)),
        migrations.AddField(model_name="appointment", name="doctor_share_amount", field=models.PositiveIntegerField(default=0)),
        migrations.AddField(model_name="appointment", name="rescheduled_from", field=models.OneToOneField(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="rescheduled_to", to="api.appointment")),
        migrations.AddField(model_name="appointment", name="reschedule_reason", field=models.TextField(blank=True, default="")),
        migrations.AddField(model_name="appointment", name="rescheduled_at", field=models.DateTimeField(blank=True, null=True)),
        migrations.AddField(model_name="appointment", name="rescheduled_by", field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="rescheduled_appointments", to=settings.AUTH_USER_MODEL)),
        migrations.AddField(model_name="appointment", name="cancellation_reason", field=models.TextField(blank=True, default="")),
        migrations.AddField(model_name="appointment", name="cancelled_at", field=models.DateTimeField(blank=True, null=True)),
        migrations.AddField(model_name="appointment", name="cancelled_by", field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="cancelled_appointments", to=settings.AUTH_USER_MODEL)),
        migrations.AddField(model_name="appointment", name="refund_status", field=models.CharField(blank=True, default="", max_length=30)),
        migrations.AddField(model_name="appointment", name="refund_method", field=models.CharField(blank=True, default="", max_length=30)),
        migrations.AddField(model_name="appointment", name="refund_amount", field=models.PositiveIntegerField(default=0)),
        migrations.AddField(model_name="appointment", name="refund_reference", field=models.CharField(blank=True, default="", max_length=120)),
        migrations.AddField(model_name="appointment", name="refund_notes", field=models.TextField(blank=True, default="")),
        migrations.AddField(model_name="appointment", name="refund_recorded_at", field=models.DateTimeField(blank=True, null=True)),
        migrations.AddField(model_name="appointment", name="refund_recorded_by", field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="recorded_appointment_refunds", to=settings.AUTH_USER_MODEL)),
        migrations.RunPython(backfill_consultation_financials, migrations.RunPython.noop),
    ]
