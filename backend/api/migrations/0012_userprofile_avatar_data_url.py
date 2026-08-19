from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("api", "0011_operational_security_records")]
    operations = [
        migrations.AddField(
            model_name="userprofile",
            name="avatar_data_url",
            field=models.TextField(blank=True, default=""),
        ),
    ]
