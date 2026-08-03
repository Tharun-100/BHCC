import { apiFetch, getApiBaseUrl } from '@/lib/api';
import { getAccessToken } from '@/lib/storage';
import { AttendanceRecord, LeaveRequest, Prescription } from '@/types';

const token = () => {
  const value = getAccessToken();
  if (!value) throw new Error('Not authenticated.');
  return value;
};

export const listMyAttendance = () => apiFetch<AttendanceRecord[]>('/api/attendance/', { method: 'GET', authToken: token() });
export const attendanceAction = (action: 'CHECK_IN' | 'CHECK_OUT') => apiFetch<AttendanceRecord>('/api/attendance/', { method: 'POST', authToken: token(), body: JSON.stringify({ action }) });
export const listMyLeaveRequests = () => apiFetch<LeaveRequest[]>('/api/leave-requests/', { method: 'GET', authToken: token() });
export const createLeaveRequest = (payload: { leaveType: string; startDate: string; endDate: string; reason: string }) => apiFetch<LeaveRequest>('/api/leave-requests/', { method: 'POST', authToken: token(), body: JSON.stringify(payload) });
export const listAdminAttendance = (month: string) => apiFetch<AttendanceRecord[]>(`/api/admin/attendance/?month=${encodeURIComponent(month)}`, { method: 'GET', authToken: token() });
export const correctAttendance = (id: string, payload: { status: AttendanceRecord['status']; adminNotes: string; reason: string }) => apiFetch<AttendanceRecord>(`/api/admin/attendance/${id}/`, { method: 'PATCH', authToken: token(), body: JSON.stringify(payload) });
export const listAdminLeaveRequests = () => apiFetch<LeaveRequest[]>('/api/admin/leave-requests/', { method: 'GET', authToken: token() });
export const reviewLeaveRequest = (id: string, status: 'APPROVED' | 'REJECTED') => apiFetch<LeaveRequest>(`/api/admin/leave-requests/${id}/`, { method: 'PATCH', authToken: token(), body: JSON.stringify({ status }) });

export const getAppointmentPrescription = (appointmentId: string) => apiFetch<Prescription>(`/api/appointments/${appointmentId}/prescription/`, { method: 'GET', authToken: token() });
export const saveAppointmentPrescription = (appointmentId: string, payload: Partial<Prescription>) => apiFetch<Prescription>(`/api/appointments/${appointmentId}/prescription/`, { method: 'PUT', authToken: token(), body: JSON.stringify(payload) });
export const finalizePrescription = (id: string) => apiFetch<Prescription>(`/api/prescriptions/${id}/finalize/`, { method: 'POST', authToken: token() });
export const amendPrescription = (id: string) => apiFetch<Prescription>(`/api/prescriptions/${id}/amend/`, { method: 'POST', authToken: token() });
export const listPrescriptions = () => apiFetch<Prescription[]>('/api/prescriptions/', { method: 'GET', authToken: token() });
export const downloadPrescriptionPdf = async (id: string, filename: string) => {
  const response = await fetch(`${getApiBaseUrl()}/prescriptions/${id}/pdf/`, { headers: { Authorization: `Bearer ${token()}` } });
  if (!response.ok) throw new Error('Could not download prescription.');
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url);
};
