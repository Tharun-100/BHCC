
export enum UserRole {
  PUBLIC = 'PUBLIC',
  PATIENT = 'PATIENT',
  DOCTOR = 'DOCTOR',
  ADMIN = 'ADMIN',
  COUNTER = 'COUNTER'
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
  specialty?: string; // For doctors
  department?: string; // For doctors
  experience?: string; // For doctors
  fee?: number; // For doctors
  availableDays?: string[]; // e.g., ['Monday', 'Wednesday']
  workingHours?: { start: string, end: string }; // e.g., { start: '09:00', end: '17:00' }
  availability?: Record<string, string[]>; // Date (YYYY-MM-DD) -> Array of available time slots (HH:MM)
}

export interface TimeSlot {
  time: string;
  isAvailable: boolean;
  isBooked?: boolean;
}

export interface Department {
  id: string;
  name: string;
  icon: string;
  description: string;
  baseFee: number;
}

export interface Appointment {
  id: string;
  patientId: string;
  patientName: string;
  doctorId: string;
  doctorName: string;
  department: string;
  date: string; // Format: YYYY-MM-DD
  time: string; // Format: HH:MM
  fee: number;
  status: 'Upcoming' | 'Completed' | 'Cancelled';
  paymentId: string;
}

export interface Feedback {
  id: string;
  patientName: string;
  rating: number;
  comment: string;
  date: string;
}

export interface LabRegistration {
  id: string;
  name: string;
  age: number;
  time: string;
  fee: number;
}
