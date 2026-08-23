from django.urls import path

from . import views

urlpatterns = [
    path("me/", views.reporting_me),
    path("reports/current/", views.current_report),
    path("reports/<int:pk>/", views.report_detail),
    path("reports/<int:pk>/submit/", views.submit_report),
    path("reports/<int:pk>/reopen/", views.reopen_report),
    path("reports/<int:pk>/feedback/", views.add_feedback),
    path("group/reports/", views.group_reports),
    path("group/manage/", views.manage_group),
]
