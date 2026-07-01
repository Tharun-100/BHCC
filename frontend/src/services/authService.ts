
import { apiFetch } from '@/lib/api';
import { clearTokens, getAccessToken, setTokens } from '@/lib/storage';
import { PatientRegistrationPayload, User, WeeklySchedule } from '@/types';

type AuthResponse = {
  access: string;
  refresh?: string;
  user: User;
};

type StaffOtpStartResponse = {
  challengeId?: string;
  email?: string;
  otpSent?: boolean;
  requiresOtp?: boolean;
  devOtp?: string;
  detail?: string;
  access?: string;
  refresh?: string;
  user?: User;
};

export type StaffProfilePayload = {
  name: string;
  phoneNo: string;
  profession: string;
  address: string;
  religion?: string;
  iskconVisited?: boolean;
  iskconVisitFrequency?: string;
  chantsHareKrishna?: boolean;
  mahamantraRounds?: number | null;
  prabhupadaBooks?: {
    small: string;
    medium: string;
    big: string;
  };
  department?: string;
  specialty?: string;
  experience?: string;
  fee?: number | null;
  availableDays?: string[];
  workingHours?: { start: string; end: string };
  weeklySchedule?: WeeklySchedule;
};

export const getCurrentUserProfile = async (): Promise<User | null> => {
  const token = getAccessToken();
  if (!token) return null;
  return apiFetch<User>('/api/auth/me/', { method: 'GET', authToken: token, cache: 'no-store' });
};

export const loginWithEmail = async (email: string, password: string): Promise<User> => {
  const data = await apiFetch<AuthResponse>('/api/auth/login/', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
  setTokens(data.access, data.refresh);
  return data.user;
};

export const requestStaffLoginOtp = async (email: string, password: string, role: string): Promise<StaffOtpStartResponse> => {
  const data = await apiFetch<StaffOtpStartResponse>('/api/auth/staff/request-otp/', {
    method: 'POST',
    body: JSON.stringify({ email, password, role })
  });
  if (data.access) setTokens(data.access, data.refresh);
  return data;
};

export const verifyStaffLoginOtp = async (challengeId: string, otp: string): Promise<User> => {
  const data = await apiFetch<AuthResponse>('/api/auth/staff/verify-otp/', {
    method: 'POST',
    body: JSON.stringify({ challengeId, otp })
  });
  setTokens(data.access, data.refresh);
  return data.user;
};

export const registerPatientWithEmail = async (payload: PatientRegistrationPayload): Promise<User> => {
  const data = await apiFetch<AuthResponse>('/api/auth/register-patient/', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  setTokens(data.access, data.refresh);
  return data.user;
};

export const getPatientProfile = async (): Promise<User> => {
  const token = getAccessToken();
  if (!token) throw new Error('Please sign in again.');
  return apiFetch<User>('/api/patient/profile/', { method: 'GET', authToken: token, cache: 'no-store' });
};

export const updatePatientProfile = async (payload: Omit<PatientRegistrationPayload, 'password'>): Promise<User> => {
  const token = getAccessToken();
  if (!token) throw new Error('Please sign in again.');
  return apiFetch<User>('/api/patient/profile/', {
    method: 'PATCH',
    authToken: token,
    body: JSON.stringify(payload)
  });
};

export const getStaffProfile = async (): Promise<User> => {
  const token = getAccessToken();
  if (!token) throw new Error('Please sign in again.');
  return apiFetch<User>('/api/staff/profile/', { method: 'GET', authToken: token, cache: 'no-store' });
};

export const updateStaffProfile = async (payload: StaffProfilePayload): Promise<User> => {
  const token = getAccessToken();
  if (!token) throw new Error('Please sign in again.');
  return apiFetch<User>('/api/staff/profile/', {
    method: 'PATCH',
    authToken: token,
    body: JSON.stringify(payload)
  });
};

export const loginWithGoogle = async (): Promise<User> => {
  throw new Error('Google login is not configured in the BHCC (Django) stack yet.');
};

export const logoutUser = async (): Promise<void> => {
  clearTokens();
};

export const requestPasswordReset = async (email: string): Promise<void> => {
  const normalized = email.trim();
  if (!normalized) throw new Error('Please enter a valid email address.');
  await apiFetch<{ ok: true }>('/api/auth/password-reset/', {
    method: 'POST',
    body: JSON.stringify({ email: normalized })
  });
};
