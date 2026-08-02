from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0005_staff_type_salary_and_staff_role"),
    ]

    operations = [
        migrations.AddField(
            model_name="appointment",
            name="confirmation_email_sent_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
