from django.db import migrations


def assign_patient_ids(apps, schema_editor):
    UserProfile = apps.get_model("api", "UserProfile")
    Sequence = apps.get_model("api", "PatientIdentifierSequence")
    value = 0
    for profile in UserProfile.objects.filter(role="PATIENT").order_by("id").iterator():
        value += 1
        profile.patient_id = f"BHCC{value:09d}"
        profile.save(update_fields=["patient_id"])
    Sequence.objects.update_or_create(pk=1, defaults={"last_value": value})


class Migration(migrations.Migration):
    dependencies = [("api", "0009_patientidentifiersequence_and_more")]
    operations = [migrations.RunPython(assign_patient_ids, migrations.RunPython.noop)]
