
import { Department, User, UserRole } from './types';

export const CLINIC_NAME = "Bhaktivedanta Health Care Center";
export const CLINIC_ADDRESS = "ISKCON Newtown, Near Shapoorji Bus Terminus, Ekajul, Action Area III, Newtown, Kolkata, Hudarait, West Bengal 700135";
export const CLINIC_PHONE = "+91 9948434604";
export const CLINIC_EMAIL = "vuttipallytharun17@gmail.com";

export const DEPARTMENTS: Department[] = [
  { id: '1', name: 'General Medicine', icon: 'Stethoscope', description: 'Comprehensive primary care for adults and children.', baseFee: 500 },
  { id: '2', name: 'Cardiology', icon: 'HeartPulse', description: 'Expert care for your heart and vascular health.', baseFee: 1200 },
  { id: '3', name: 'Ayurveda', icon: 'Leaf', description: 'Traditional holistic healing for mind, body, and soul.', baseFee: 600 },
  { id: '4', name: 'Pediatrics', icon: 'Baby', description: 'Specialized healthcare for infants, children, and adolescents.', baseFee: 800 },
  { id: '5', name: 'Orthopedics', icon: 'Bone', description: 'Bone and joint care with advanced surgical options.', baseFee: 1000 },
  { id: '6', name: 'Neurology', icon: 'Brain', description: 'Diagnosis and treatment of complex nervous system disorders.', baseFee: 1500 },
];

export const DOCTORS: User[] = [
  {
    id: 'd1',
    name: 'Dr. Aarav Sharma',
    email: 'aarav@clinic.com',
    role: UserRole.DOCTOR,
    department: 'Cardiology',
    specialty: 'Interventional Cardiology',
    experience: '15 Years',
    fee: 1500,
    availableDays: ['Monday', 'Wednesday', 'Friday'],
    workingHours: { start: '09:00', end: '13:00' }
  },
  {
    id: 'd2',
    name: 'Dr. Ishani Gupta',
    email: 'ishani@clinic.com',
    role: UserRole.DOCTOR,
    department: 'Ayurveda',
    specialty: 'Panchakarma Expert',
    experience: '10 Years',
    fee: 800,
    availableDays: ['Tuesday', 'Thursday', 'Saturday'],
    workingHours: { start: '14:00', end: '18:00' }
  },
  {
    id: 'd3',
    name: 'Dr. Rohan Mehra',
    email: 'rohan@clinic.com',
    role: UserRole.DOCTOR,
    department: 'General Medicine',
    specialty: 'Internal Medicine',
    experience: '12 Years',
    fee: 600,
    availableDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    workingHours: { start: '10:00', end: '16:00' }
  },
  {
    id: 'd4',
    name: 'Dr. Kavita Singh',
    email: 'kavita@clinic.com',
    role: UserRole.DOCTOR,
    department: 'Pediatrics',
    specialty: 'Child Specialist',
    experience: '8 Years',
    fee: 1000,
    availableDays: ['Monday', 'Thursday', 'Saturday'],
    workingHours: { start: '09:00', end: '12:00' }
  },
];
