from django.contrib import admin

from .models import Appointment, AttendanceRecord, Consultation, Department, DoctorAvailability, Feedback, LabRegistration, LeaveRequest, Prescription, UserProfile

admin.site.register(UserProfile)
admin.site.register(Department)
admin.site.register(Appointment)
admin.site.register(Feedback)
admin.site.register(LabRegistration)
admin.site.register(DoctorAvailability)
admin.site.register(AttendanceRecord)
admin.site.register(LeaveRequest)
admin.site.register(Consultation)
admin.site.register(Prescription)
