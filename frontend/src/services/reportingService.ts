import { ApiError } from '@/lib/api';
import { clearReportingTokens, getReportingAccessToken, getReportingRefreshToken, setReportingTokens } from '@/lib/reportingStorage';

export type ReportingRole = 'MEMBER' | 'LEADER' | 'ADMIN';
export interface ReportingMembership { id:string; groupId:string; groupName:string; role:ReportingRole; name:string; email:string }
export interface AppreciationDraft { recipientId:string; recipientName?:string; reason:string; contribution:string }
export interface ServiceTaskDraft { id?:string; title:string; description:string; categoryId?:string|null; category?:string|null; priority:'LOW'|'MEDIUM'|'HIGH'; startDate?:string|null; deadline?:string|null; status:'NOT_STARTED'|'IN_PROGRESS'|'COMPLETED'|'CARRIED_FORWARD'|'CANCELLED'; completionDate?:string|null; result:string; evidenceUrl:string; collaboratorIds:string[] }
export interface WeeklyReport { id:string; membership:ReportingMembership; weekStart:string; weekEnd:string; deadline:string; status:'DRAFT'|'SUBMITTED'|'REOPENED'; happiness:string; challenges:string; needsSupport:boolean; submittedAt?:string|null; revision:number; appreciations:AppreciationDraft[]; tasks:ServiceTaskDraft[]; feedback:Array<{leaderName:string;comment:string;createdAt:string}>; members?:ReportingMembership[]; categories?:Array<{id:string;name:string}> }
export interface GroupReportSummary { weekStart:string; weekEnd:string; reports:WeeklyReport[]; pendingMembers:ReportingMembership[] }
export interface GroupManagement { group:{id:string;name:string;description:string}; members:Array<ReportingMembership&{isActive:boolean}>; categories:Array<{id:string;name:string;isActive:boolean}> }

async function reportingFetch<T>(path:string,init:RequestInit={}):Promise<T>{
 const request=async(token:string|null)=>fetch(`/api/reporting${path}`,{...init,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})}});
 let response=await request(getReportingAccessToken());
 if(response.status===401&&getReportingRefreshToken()){
  const refreshed=await fetch('/api/auth/token/refresh/',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({refresh:getReportingRefreshToken()})});
  if(refreshed.ok){const data=await refreshed.json() as {access:string;refresh?:string};setReportingTokens(data.access,data.refresh||getReportingRefreshToken()||undefined);response=await request(data.access);}else clearReportingTokens();
 }
 const contentType=response.headers.get('content-type')||'';const body=contentType.includes('application/json')?await response.json().catch(()=>null):await response.text();
 if(!response.ok){const message=typeof body==='object'&&body&&'detail'in body?String(body.detail):`Request failed: ${response.status}`;throw new ApiError(message,response.status,body);}return body as T;
}
export const loginToReporting = async(email:string,password:string)=>{const data=await reportingFetch<{access:string;refresh:string;memberships:ReportingMembership[]}>('/auth/login/',{method:'POST',body:JSON.stringify({email,password})});setReportingTokens(data.access,data.refresh);return data;};
export const logoutFromReporting=()=>clearReportingTokens();
export const getReportingAccess = () => reportingFetch<{hasAccess:boolean;memberships:ReportingMembership[]}>('/me/');
export const getCurrentReport = (membershipId:string) => reportingFetch<WeeklyReport>(`/reports/current/?membershipId=${encodeURIComponent(membershipId)}`);
export const saveWeeklyReport = (report:WeeklyReport) => reportingFetch<WeeklyReport>(`/reports/${report.id}/`, {method:'PUT',body:JSON.stringify(report)});
export const submitWeeklyReport = (id:string) => reportingFetch<WeeklyReport>(`/reports/${id}/submit/`, {method:'POST',body:'{}'});
export const getGroupReports = (membershipId:string) => reportingFetch<GroupReportSummary>(`/group/reports/?membershipId=${encodeURIComponent(membershipId)}`);
export const addReportFeedback = (id:string,comment:string) => reportingFetch<WeeklyReport>(`/reports/${id}/feedback/`, {method:'POST',body:JSON.stringify({comment})});
export const reopenWeeklyReport = (id:string) => reportingFetch<WeeklyReport>(`/reports/${id}/reopen/`, {method:'POST',body:'{}'});
export const getGroupManagement = (membershipId:string) => reportingFetch<GroupManagement>(`/group/manage/?membershipId=${encodeURIComponent(membershipId)}`);
export const updateGroupManagement = (membershipId:string,payload:Record<string,unknown>) => reportingFetch<GroupManagement>('/group/manage/', {method:'POST',body:JSON.stringify({membershipId,...payload})});
