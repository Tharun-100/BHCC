from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.authentication import JWTAuthentication


class ClinicalJWTAuthentication(JWTAuthentication):
    """Accept only normal BHCC clinical sessions."""

    def authenticate(self, request):
        result = super().authenticate(request)
        if result and result[1].get("scope") == "reporting":
            raise AuthenticationFailed("This session is valid only for the service-reporting portal.")
        return result


class ReportingJWTAuthentication(JWTAuthentication):
    """Accept only tokens issued by the separate reporting login."""

    def authenticate(self, request):
        result = super().authenticate(request)
        if result and result[1].get("scope") != "reporting":
            raise AuthenticationFailed("Please sign in through the service-reporting portal.")
        return result
