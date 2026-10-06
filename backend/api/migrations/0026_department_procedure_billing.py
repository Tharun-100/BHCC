from django.db import migrations, models
from django.db.models import F


def backfill(apps, schema_editor):
    Appointment = apps.get_model("api", "Appointment")
    Appointment.objects.filter(payment_status="Confirmed").update(collected_amount=F("fee"))
    Procedure = apps.get_model("api", "DentalProcedure")
    Department = apps.get_model("api", "Department")
    dental = next((row.name for row in Department.objects.all() if "dental" in row.name.lower() or "dentistry" in row.name.lower()), "Dental")
    Procedure.objects.all().update(department=dental)


class Migration(migrations.Migration):
    dependencies = [("api", "0025_appointment_historical_entry_at_and_more")]
    operations = [
        migrations.AddField(model_name="dentalprocedure", name="department", field=models.CharField(default="Dental", max_length=120)),
        migrations.AlterField(model_name="dentalprocedure", name="name", field=models.CharField(max_length=160)),
        migrations.AddConstraint(model_name="dentalprocedure", constraint=models.UniqueConstraint(fields=("department", "name"), name="unique_department_procedure")),
        migrations.AddField(model_name="appointment", name="collected_amount", field=models.PositiveIntegerField(default=0)),
        migrations.RunPython(backfill, migrations.RunPython.noop),
    ]
