from django.contrib import admin

from .models import Appreciation, GroupMembership, LeaderFeedback, ReportRevision, ReportingPeriod, ServiceCategory, ServiceGroup, ServiceTask, TaskUpdate, WeeklyServiceReport


admin.site.register(ServiceGroup)
admin.site.register(GroupMembership)
admin.site.register(ServiceCategory)
admin.site.register(ReportingPeriod)
admin.site.register(WeeklyServiceReport)
admin.site.register(Appreciation)
admin.site.register(ServiceTask)
admin.site.register(TaskUpdate)
admin.site.register(LeaderFeedback)
admin.site.register(ReportRevision)
