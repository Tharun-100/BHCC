from django.db import migrations, models


def clear_old_registration_fees(apps, schema_editor):
    apps.get_model("api", "LabRegistration").objects.filter(is_free_camp=False).update(fee=0)


class Migration(migrations.Migration):
    dependencies = [("api", "0020_dental_procedures")]
    operations = [
        migrations.AlterField(model_name="labregistration", name="fee", field=models.PositiveIntegerField(default=0)),
        migrations.RunPython(clear_old_registration_fees, migrations.RunPython.noop),
    ]
