from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [("api", "0018_appointment_manual_pos_fields"), migrations.swappable_dependency(settings.AUTH_USER_MODEL)]
    operations = [
        migrations.AddField(model_name="campregistration", name="doctor", field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="camp_patient_registrations_as_doctor", to=settings.AUTH_USER_MODEL)),
        migrations.AddField(model_name="campregistration", name="appointment", field=models.OneToOneField(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="camp_registration", to="api.appointment")),
    ]
