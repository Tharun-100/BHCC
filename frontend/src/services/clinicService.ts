import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/storage';
import { Appointment, Department, Feedback, FreeCamp, LabRegistration, PayrollRecord, User, WeeklySchedule } from '@/types';

type NewAppointmentInput = Omit<Appointment, 'id' | 'status' | 'paymentId'> & {
  status?: Appointment['status'];
  paymentId?: string;
};

type NewFeedbackInput = Omit<Feedback, 'id' | 'date'> & {
  patientId: string;
  patientEmail: string;
};

const authTokenOrThrow = () => {
  const token = getAccessToken();
  if (!token) throw new Error('Not authenticated.');
  return token;
};

export const listDoctors = async (): Promise<User[]> => apiFetch<User[]>('/api/doctors/', { method: 'GET' });

export const updateDoctorWeeklySchedule = async (doctorId: string, weeklySchedule: WeeklySchedule): Promise<User> => {
  const token = authTokenOrThrow();
  return apiFetch<User>(`/api/management/doctors/${encodeURIComponent(doctorId)}/schedule/`, {
    method: 'PATCH',
    authToken: token,
    body: JSON.stringify({ weeklySchedule })
  });
};

type DepartmentInput = Omit<Department, 'id'>;

export const listDepartments = async (): Promise<Department[]> =>
  apiFetch<Department[]>('/api/departments/', { method: 'GET' });

export const createDepartment = async (payload: DepartmentInput): Promise<string> => {
  const token = authTokenOrThrow();
  const created = await apiFetch<{ id: string }>('/api/departments/', {
    method: 'POST',
    authToken: token,
    body: JSON.stringify(payload)
  });
  return created.id;
};

export const updateDepartment = async (id: string, payload: Partial<DepartmentInput>): Promise<void> => {
  const token = authTokenOrThrow();
  await apiFetch<void>(`/api/departments/${encodeURIComponent(id)}/`, {
    method: 'PATCH',
    authToken: token,
    body: JSON.stringify(payload)
  });
};

export const deleteDepartmentById = async (id: string): Promise<void> => {
  const token = authTokenOrThrow();
  await apiFetch<void>(`/api/departments/${encodeURIComponent(id)}/`, { method: 'DELETE', authToken: token });
};

export const createAppointment = async (payload: NewAppointmentInput): Promise<string> => {
  const token = authTokenOrThrow();
  const created = await apiFetch<{ id: string }>('/api/appointments/', {
    method: 'POST',
    authToken: token,
    body: JSON.stringify(payload)
  });
  return created.id;
};

export const listPatientAppointments = async (patientId: string): Promise<Appointment[]> => {
  const token = authTokenOrThrow();
  return apiFetch<Appointment[]>(
    `/api/appointments/?patient_id=${encodeURIComponent(patientId)}`,
    { method: 'GET', authToken: token }
  );
};

export const listDoctorAppointments = async (doctorId: string): Promise<Appointment[]> => {
  const token = authTokenOrThrow();
  return apiFetch<Appointment[]>(
    `/api/appointments/?doctor_id=${encodeURIComponent(doctorId)}`,
    { method: 'GET', authToken: token }
  );
};

export const listAllAppointments = async (): Promise<Appointment[]> => {
  const token = authTokenOrThrow();
  return apiFetch<Appointment[]>('/api/appointments/', { method: 'GET', authToken: token });
};

export interface AdminDashboardSummary {
  totalPatients: number;
  appointmentsToday: number;
  activeDoctors: number;
  grossRevenue: number;
  currentWeekAppointments: number;
  completedToday: number;
  weeklyGrowthPercent: number;
  recentAppointments: Appointment[];
  updatedAt: string;
}

export const getAdminDashboardSummary = async (): Promise<AdminDashboardSummary> => {
  const token = authTokenOrThrow();
  return apiFetch<AdminDashboardSummary>('/api/management/dashboard/', {
    method: 'GET',
    authToken: token
  });
};

export const listStaffAccounts = async (): Promise<User[]> => {
  const token = authTokenOrThrow();
  return apiFetch<User[]>('/api/management/staff-accounts/', { method: 'GET', authToken: token });
};

export const deleteStaffAccount = async (id: string): Promise<void> => {
  const token = authTokenOrThrow();
  await apiFetch<void>(`/api/management/accounts/${encodeURIComponent(id)}/`, { method: 'DELETE', authToken: token });
};

export const purgeTestAccount = async (id: string, confirmation: string): Promise<void> => {
  const token = authTokenOrThrow();
  await apiFetch<void>(`/api/management/accounts/${encodeURIComponent(id)}/`, { method: 'DELETE', authToken: token, body: JSON.stringify({ purgeClinicalRecords: true, confirmation }) });
};

export const resetAccountPassword = async (id: string, password: string): Promise<User> => {
  const token = authTokenOrThrow();
  const result = await apiFetch<{ ok: true; user: User }>(`/api/management/accounts/${encodeURIComponent(id)}/reset-password/`, { method: 'POST', authToken: token, body: JSON.stringify({ password }) });
  return result.user;
};

export const listAllAccounts = async (): Promise<User[]> => {
  const token = getAccessToken();
  if (!token) throw new Error('Not authenticated.');
  return apiFetch<User[]>('/api/management/accounts/', { method: 'GET', authToken: token });
};

export const setAccountActive = async (id: string, isActive: boolean): Promise<User> => {
  const token = getAccessToken();
  if (!token) throw new Error('Not authenticated.');
  return apiFetch<User>(`/api/management/accounts/${encodeURIComponent(id)}/`, { method: 'PATCH', authToken: token, body: JSON.stringify({ isActive }) });
};

export const updateAppointmentStatus = async (appointmentId: string, status: Appointment['status']): Promise<Appointment> => {
  const token = authTokenOrThrow();
  return apiFetch<Appointment>(`/api/appointments/${encodeURIComponent(appointmentId)}/`, {
    method: 'PATCH',
    authToken: token,
    body: JSON.stringify({ status })
  });
};

export const listDoctorAppointmentsByDate = async (doctorId: string, date: string): Promise<Appointment[]> => {
  const token = authTokenOrThrow();
  return apiFetch<Appointment[]>(
    `/api/appointments/?doctor_id=${encodeURIComponent(doctorId)}&date=${encodeURIComponent(date)}`,
    { method: 'GET', authToken: token }
  );
};

export const upsertDoctorAvailability = async (doctorId: string, date: string, slots: string[]): Promise<void> => {
  const token = authTokenOrThrow();
  await apiFetch<void>('/api/availability/', {
    method: 'PUT',
    authToken: token,
    body: JSON.stringify({ doctorId, date, slots })
  });
};

export const getDoctorAvailability = async (doctorId: string, date: string): Promise<string[]> => {
  const token = authTokenOrThrow();
  const data = await apiFetch<{ slots: string[] }>(
    `/api/availability/?doctor_id=${encodeURIComponent(doctorId)}&date=${encodeURIComponent(date)}`,
    { method: 'GET', authToken: token }
  );
  return data.slots || [];
};

export const submitFeedback = async (input: NewFeedbackInput): Promise<string> => {
  const token = authTokenOrThrow();
  const created = await apiFetch<{ id: string }>('/api/feedback/', {
    method: 'POST',
    authToken: token,
    body: JSON.stringify(input)
  });
  return created.id;
};

export const listApprovedFeedback = async (): Promise<Feedback[]> =>
  apiFetch<Feedback[]>('/api/feedback/?approved=true', { method: 'GET' });

export interface RegistrationInput {
  name: string;
  phoneNo: string;
  address?: string;
  nativePlace?: string;
  departmentId: string;
  isFreeCamp?: boolean;
  campId?: string;
}

export const createRegistration = async (payload: RegistrationInput): Promise<LabRegistration> => {
  const token = authTokenOrThrow();
  return apiFetch<LabRegistration>('/api/registrations/', {
    method: 'POST',
    authToken: token,
    body: JSON.stringify(payload)
  });
};

export const listRegistrations = async (): Promise<LabRegistration[]> => {
  const token = authTokenOrThrow();
  return apiFetch<LabRegistration[]>('/api/registrations/', { method: 'GET', authToken: token });
};

export const listFreeCamps = async (): Promise<FreeCamp[]> => {
  const token = authTokenOrThrow();
  return apiFetch<FreeCamp[]>('/api/free-camps/', { method: 'GET', authToken: token });
};

export const createFreeCamp = async (payload: {name:string; date:string; location:string; capacity?:number; departmentIds:string[]}): Promise<string> => {
  const token = authTokenOrThrow();
  const result = await apiFetch<{id:string}>('/api/free-camps/', {method:'POST', authToken:token, body:JSON.stringify(payload)});
  return result.id;
};

export const listPayroll = async (month: string): Promise<PayrollRecord[]> => {
  const token = authTokenOrThrow();
  return apiFetch<PayrollRecord[]>(`/api/management/payroll/?month=${encodeURIComponent(month)}`, { method: 'GET', authToken: token });
};

export const generatePayroll = async (month: string): Promise<PayrollRecord[]> => {
  const token = authTokenOrThrow();
  return apiFetch<PayrollRecord[]>('/api/management/payroll/', { method: 'POST', authToken: token, body: JSON.stringify({ month }) });
};

export const updatePayrollStatus = async (id: string, payload: {status: 'PENDING' | 'PAID'; paymentMethod?: string; reference?: string; remarks?: string}): Promise<PayrollRecord> => {
  const token = authTokenOrThrow();
  return apiFetch<PayrollRecord>(`/api/management/payroll/${encodeURIComponent(id)}/`, { method: 'PATCH', authToken: token, body: JSON.stringify(payload) });
};
