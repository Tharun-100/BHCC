from __future__ import annotations

import os
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent

load_dotenv(BASE_DIR / ".env")

POSTGRES_DB_PASSWORD = os.getenv("POSTGRES_DB_PASSWORD", "").strip()
if not POSTGRES_DB_PASSWORD:
    raise ImproperlyConfigured(
        "POSTGRES_DB_PASSWORD is missing. Run setup-postgres.ps1 or configure backend/.env before starting Django."
    )

SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "insecure-dev-key")
DEBUG = os.getenv("DJANGO_DEBUG", "false").lower() in {"1", "true", "yes"}

if not DEBUG:
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SECURE_SSL_REDIRECT = os.getenv("DJANGO_SECURE_SSL_REDIRECT", "true").lower() in {"1", "true", "yes"}
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_HSTS_SECONDS = int(os.getenv("DJANGO_HSTS_SECONDS", "300"))
    SECURE_HSTS_INCLUDE_SUBDOMAINS = os.getenv("DJANGO_HSTS_INCLUDE_SUBDOMAINS", "false").lower() in {"1", "true", "yes"}
    SECURE_CONTENT_TYPE_NOSNIFF = True
    X_FRAME_OPTIONS = "DENY"

ALLOWED_HOSTS = [h.strip() for h in os.getenv("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1").split(",") if h.strip()]
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "").strip()

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django.contrib.postgres",
    "anymail",
    "rest_framework",
    "corsheaders",
    "api",
    "reporting",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "bhcc.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    }
]

WSGI_APPLICATION = "bhcc.wsgi.application"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "HOST": os.getenv("POSTGRES_DB_HOST", "localhost"),
        "PORT": int(os.getenv("POSTGRES_DB_PORT", "5432")),
        "NAME": os.getenv("POSTGRES_DB_NAME", "bhcc"),
        "USER": os.getenv("POSTGRES_DB_USER", "postgres"),
        "PASSWORD": POSTGRES_DB_PASSWORD,
        "OPTIONS": {"sslmode": os.getenv("POSTGRES_DB_SSLMODE", "prefer")},
    }
}

if os.getenv("DJANGO_TEST_SQLITE", "false").lower() in {"1", "true", "yes"}:
    DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": BASE_DIR / "test.sqlite3"}}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "Asia/Kolkata"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedStaticFilesStorage"},
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

EMAIL_BACKEND_MODE = os.getenv("EMAIL_BACKEND_MODE", "console" if DEBUG else "resend").strip().lower()
DEFAULT_FROM_EMAIL = os.getenv("DEFAULT_FROM_EMAIL", "").strip()
SUPPORT_EMAIL = os.getenv("SUPPORT_EMAIL", "").strip()
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000" if DEBUG else "").strip().rstrip("/")
ADMIN_NOTIFICATION_EMAIL = os.getenv("ADMIN_NOTIFICATION_EMAIL", "").strip()
CLINIC_TO_EMAIL = os.getenv("CLINIC_TO_EMAIL", "").strip()
CLINIC_LOCATION = os.getenv(
    "CLINIC_LOCATION", "Bhaktivedanta Healthcare Centre, Newtown, Kolkata"
).strip()

if EMAIL_BACKEND_MODE == "console":
    EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"
elif EMAIL_BACKEND_MODE == "resend":
    resend_api_key = os.getenv("RESEND_API_KEY", "").strip()
    missing_email_settings = [
        name
        for name, value in (("RESEND_API_KEY", resend_api_key), ("DEFAULT_FROM_EMAIL", DEFAULT_FROM_EMAIL), ("SUPPORT_EMAIL", SUPPORT_EMAIL), ("FRONTEND_URL", FRONTEND_URL), ("ADMIN_NOTIFICATION_EMAIL", ADMIN_NOTIFICATION_EMAIL))
        if not value
    ]
    if missing_email_settings:
        raise ImproperlyConfigured(
            f"Missing required Resend email settings: {', '.join(missing_email_settings)}"
        )
    EMAIL_BACKEND = "anymail.backends.resend.EmailBackend"
    ANYMAIL = {"RESEND_API_KEY": resend_api_key}
else:
    raise ImproperlyConfigured("EMAIL_BACKEND_MODE must be either 'console' or 'resend'.")

EMAIL_TIMEOUT = 15
PASSWORD_RESET_TIMEOUT = 60 * 60 * 24
EMAIL_VERIFICATION_COOLDOWN_SECONDS = 60
PASSWORD_RESET_COOLDOWN_SECONDS = 60

CORS_ALLOWED_ORIGINS = [o.strip() for o in os.getenv("CORS_ALLOWED_ORIGINS", "http://localhost:3000").split(",") if o.strip()]
CSRF_TRUSTED_ORIGINS = [
    o.strip()
    for o in os.getenv("CSRF_TRUSTED_ORIGINS", os.getenv("CORS_ALLOWED_ORIGINS", "http://localhost:3000")).split(",")
    if o.strip()
]

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ("api.authentication.ClinicalJWTAuthentication",),
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
    "DEFAULT_THROTTLE_CLASSES": ("rest_framework.throttling.AnonRateThrottle", "rest_framework.throttling.UserRateThrottle"),
    "DEFAULT_THROTTLE_RATES": {"anon": "60/minute", "user": "300/minute"},
}

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": os.getenv("DJANGO_LOG_LEVEL", "INFO")},
}
