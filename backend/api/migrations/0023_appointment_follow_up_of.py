from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [("api", "0022_appointment_daily_department_token")]

    operations = [
        migrations.AddField(
            model_name="appointment",
            name="follow_up_of",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="follow_ups",
                to="api.appointment",
            ),
        ),
    ]
