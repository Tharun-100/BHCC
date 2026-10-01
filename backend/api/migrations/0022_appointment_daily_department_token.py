from django.db import migrations, models
from django.db.models import Q


class Migration(migrations.Migration):
    dependencies = [("api", "0021_remove_registration_fee")]

    operations = [
        migrations.AddField(
            model_name="appointment",
            name="department_sequence",
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="appointment",
            name="token_number",
            field=models.CharField(blank=True, default="", max_length=30),
        ),
        migrations.AddConstraint(
            model_name="appointment",
            constraint=models.UniqueConstraint(
                condition=Q(department_sequence__isnull=False),
                fields=("department", "date", "department_sequence"),
                name="unique_daily_appointment_department_token",
            ),
        ),
    ]
