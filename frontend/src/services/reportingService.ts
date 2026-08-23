import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/storage';

export type ReportingRole = 'MEMBER' | 'LEADER' | 'ADMIN';
export interface ReportingMembership { id:string; groupId:string; groupName:string; role:ReportingRole; name:string; email:string }
export interface AppreciationDraft { recipientId:string; recipientName?:string; reason:string; contribution:string }
export interface ServiceTaskDraft { id?:string; title:string; description:string; categoryId?:string|null; category?:string|null; priority:'LOW'|'MEDIUM'|'HIGH'; startDate?:string|null; deadline?:string|null; status:'NOT_STARTED'|'IN_PROGRESS'|'COMPLETED'|'CARRIED_FORWARD'|'CANCELLED'; completionDate?:string|null; result:string; evidenceUrl:string; collaboratorIds:string[] }
export interface WeeklyReport { id:string; membership:ReportingMembership; weekStart:string; weekEnd:string; deadline:string; status:'DRAFT'|'SUBMITTED'|'REOPENED'; happiness:string; challenges:string; needsSupport:boolean; submittedAt?:string|null; revision:number; appreciations:AppreciationDraft[]; tasks:ServiceTaskDraft[]; feedback:Array<{leaderName:string;comment:string;createdAt:string}>; members?:ReportingMembership[]; categories?:Array<{id:string;name:string}> }
export interface GroupReportSummary { weekStart:string; weekEnd:string; reports:WeeklyReport[]; pendingMembers:ReportingMembership[] }
export interface GroupManagement { group:{id:string;name:string;description:string}; members:Array<ReportingMembership&{isActive:boolean}>; categories:Array<{id:string;name:string;isActive:boolean}> }

const auth = () => ({ authToken: getAccessToken() || undefined });
export const getReportingAccess = () => apiFetch<{hasAccess:boolean;memberships:ReportingMembership[]}>('/api/reporting/me/', auth());
export const getCurrentReport = (membershipId:string) => apiFetch<WeeklyReport>(`/api/reporting/reports/current/?membershipId=${encodeURIComponent(membershipId)}`, auth());
export const saveWeeklyReport = (report:WeeklyReport) => apiFetch<WeeklyReport>(`/api/reporting/reports/${report.id}/`, {method:'PUT',...auth(),body:JSON.stringify(report)});
export const submitWeeklyReport = (id:string) => apiFetch<WeeklyReport>(`/api/reporting/reports/${id}/submit/`, {method:'POST',...auth(),body:'{}'});
export const getGroupReports = (membershipId:string) => apiFetch<GroupReportSummary>(`/api/reporting/group/reports/?membershipId=${encodeURIComponent(membershipId)}`, auth());
export const addReportFeedback = (id:string,comment:string) => apiFetch<WeeklyReport>(`/api/reporting/reports/${id}/feedback/`, {method:'POST',...auth(),body:JSON.stringify({comment})});
export const reopenWeeklyReport = (id:string) => apiFetch<WeeklyReport>(`/api/reporting/reports/${id}/reopen/`, {method:'POST',...auth(),body:'{}'});
export const getGroupManagement = (membershipId:string) => apiFetch<GroupManagement>(`/api/reporting/group/manage/?membershipId=${encodeURIComponent(membershipId)}`, auth());
export const updateGroupManagement = (membershipId:string,payload:Record<string,unknown>) => apiFetch<GroupManagement>('/api/reporting/group/manage/', {method:'POST',...auth(),body:JSON.stringify({membershipId,...payload})});
