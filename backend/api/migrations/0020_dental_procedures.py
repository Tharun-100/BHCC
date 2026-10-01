from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [("api", "0019_camp_doctor_booking"), migrations.swappable_dependency(settings.AUTH_USER_MODEL)]
    operations = [
        migrations.CreateModel(name="DentalProcedure", fields=[("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")), ("name", models.CharField(max_length=160, unique=True)), ("description", models.TextField(blank=True, default="")), ("charge", models.PositiveIntegerField()), ("is_active", models.BooleanField(default=True)), ("created_at", models.DateTimeField(auto_now_add=True)), ("updated_at", models.DateTimeField(auto_now=True))]),
        migrations.CreateModel(name="AppointmentProcedure", fields=[("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")), ("name", models.CharField(max_length=160)), ("charge", models.PositiveIntegerField()), ("created_at", models.DateTimeField(auto_now_add=True)), ("added_by", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="added_appointment_procedures", to=settings.AUTH_USER_MODEL)), ("appointment", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="procedure_charges", to="api.appointment")), ("procedure", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="appointment_charges", to="api.dentalprocedure"))], options={"constraints": [models.UniqueConstraint(fields=("appointment", "procedure"), name="unique_appointment_procedure")]}),
    ]
