from django.db import migrations


def update_shares(apps, schema_editor):
    Appointment = apps.get_model("api", "Appointment")
    for appointment in Appointment.objects.all().iterator():
        appointment.doctor_share_amount = appointment.fee * appointment.doctor_share_percent // 100
        appointment.save(update_fields=["doctor_share_amount"])


class Migration(migrations.Migration):
    dependencies = [("api", "0026_department_procedure_billing")]
    operations = [migrations.RunPython(update_shares, migrations.RunPython.noop)]
