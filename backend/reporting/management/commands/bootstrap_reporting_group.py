from django.contrib.auth.models import User
from django.core.management.base import BaseCommand, CommandError

from reporting.models import GroupMembership, ServiceGroup


class Command(BaseCommand):
    help = "Create a service-reporting group and explicitly grant its first administrator."

    def add_arguments(self, parser):
        parser.add_argument("--name", required=True)
        parser.add_argument("--admin-email", required=True)

    def handle(self, *args, **options):
        email = options["admin_email"].strip().lower()
        user = User.objects.filter(email__iexact=email).first() or User.objects.filter(username__iexact=email).first()
        if not user:
            raise CommandError("No existing BHCC account uses that email.")
        group, created = ServiceGroup.objects.get_or_create(name=options["name"].strip())
        GroupMembership.objects.update_or_create(group=group, user=user, defaults={"role": GroupMembership.Role.ADMIN, "is_active": True})
        self.stdout.write(self.style.SUCCESS(f"{'Created' if created else 'Updated'} {group.name}; reporting administrator: {email}"))
