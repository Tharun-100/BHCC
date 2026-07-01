from django.contrib import admin

from .models import Appointment, Department, DoctorAvailability, Feedback, LabRegistration, UserProfile

admin.site.register(UserProfile)
admin.site.register(Department)
admin.site.register(Appointment)
admin.site.register(Feedback)
admin.site.register(LabRegistration)
admin.site.register(DoctorAvailability)

