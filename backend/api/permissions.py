from __future__ import annotations

from rest_framework.permissions import BasePermission

from .models import UserRole


class HasRole(BasePermission):
    allowed_roles: set[str] = set()

    def has_permission(self, request, view) -> bool:
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated:
            return False
        profile = getattr(user, "profile", None)
        role = getattr(profile, "role", None)
        return role in self.allowed_roles


class IsAdmin(HasRole):
    allowed_roles = {UserRole.ADMIN}


class IsDoctor(HasRole):
    allowed_roles = {UserRole.DOCTOR}


class IsCounter(HasRole):
    allowed_roles = {UserRole.COUNTER, UserRole.ADMIN}


class IsPatient(HasRole):
    allowed_roles = {UserRole.PATIENT}

