from __future__ import annotations

from getpass import getpass

from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from api.models import UserProfile, UserRole


class Command(BaseCommand):
    help = "Create a BHCC patient, doctor, admin, counter, or staff account."

    def add_arguments(self, parser):
        parser.add_argument("--email", required=True)
        parser.add_argument("--name", required=True)
        parser.add_argument("--role", required=True, choices=[UserRole.PATIENT, UserRole.DOCTOR, UserRole.ADMIN, UserRole.COUNTER, UserRole.STAFF])
        parser.add_argument("--staff-type", default="")
        parser.add_argument("--salary", type=int)
        parser.add_argument("--department", default="")
        parser.add_argument("--specialty", default="")
        parser.add_argument("--experience", default="")
        parser.add_argument("--fee", type=int)
        parser.add_argument("--available-days", default="")
        parser.add_argument("--working-start", default="09:00")
        parser.add_argument("--working-end", default="17:00")

    @transaction.atomic
    def handle(self, *args, **options):
        email = options["email"].strip().lower()
        name = options["name"].strip()
        role = options["role"]

        if not email or not name:
            raise CommandError("Name and email cannot be blank.")
        if User.objects.filter(username=email).exists():
            raise CommandError(f"An account already exists for {email}.")

        if role == UserRole.DOCTOR:
            required = [options["department"], options["specialty"], options["experience"], options["fee"]]
            if not all(required) or options["fee"] <= 0:
                raise CommandError("Doctor accounts require --department, --specialty, --experience, and a positive --fee.")

        password = getpass("Password: ")
        confirmation = getpass("Confirm password: ")
        if password != confirmation:
            raise CommandError("Passwords do not match.")

        user = User(username=email, email=email, first_name=name, is_staff=role == UserRole.ADMIN)
        try:
            validate_password(password, user=user)
        except ValidationError as error:
            raise CommandError(" ".join(error.messages)) from error

        user.set_password(password)
        user.save()
        UserProfile.objects.create(
            user=user,
            role=role,
            name=name,
            department=options["department"].strip(),
            specialty=options["specialty"].strip(),
            experience=options["experience"].strip(),
            fee=options["fee"],
            staff_type=options["staff_type"].strip(),
            salary=options["salary"],
            available_days=[day.strip() for day in options["available_days"].split(",") if day.strip()],
            working_hours_start=options["working_start"],
            working_hours_end=options["working_end"],
        )
        self.stdout.write(self.style.SUCCESS(f"Created {role} account for {email}."))
