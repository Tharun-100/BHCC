import {
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { db } from '../firebase';
import { Appointment, Department, Feedback, LabRegistration, User } from '../types';

type NewAppointmentInput = Omit<Appointment, 'id' | 'status' | 'paymentId'> & {
  status?: Appointment['status'];
  paymentId?: string;
};

type NewFeedbackInput = Omit<Feedback, 'id' | 'date'> & {
  patientId: string;
  patientEmail: string;
};

export const COLLECTIONS = {
  departments: 'departments',
  users: 'users',
  appointments: 'appointments',
  feedback: 'feedback',
  registrations: 'registrations',
  availability: 'availability',
} as const;

export const listDoctors = async (): Promise<User[]> => {
  const q = query(collection(db, COLLECTIONS.users), where('role', '==', 'DOCTOR'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<User, 'id'>) }));
};

type DepartmentInput = Omit<Department, 'id'>;

export const listDepartments = async (): Promise<Department[]> => {
  const snap = await getDocs(collection(db, COLLECTIONS.departments));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Department, 'id'>) }));
};

export const createDepartment = async (payload: DepartmentInput): Promise<string> => {
  const docRef = await addDoc(collection(db, COLLECTIONS.departments), {
    ...payload,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
};

export const updateDepartment = async (
  id: string,
  payload: Partial<DepartmentInput>
): Promise<void> => {
  await setDoc(
    doc(db, COLLECTIONS.departments, id),
    {
      ...payload,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
};

export const deleteDepartmentById = async (id: string): Promise<void> => {
  await deleteDoc(doc(db, COLLECTIONS.departments, id));
};

export const createAppointment = async (payload: NewAppointmentInput): Promise<string> => {
  const docRef = await addDoc(collection(db, COLLECTIONS.appointments), {
    ...payload,
    status: payload.status || 'Upcoming',
    paymentId: payload.paymentId || '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
};

export const listPatientAppointments = async (patientId: string): Promise<Appointment[]> => {
  const q = query(collection(db, COLLECTIONS.appointments), where('patientId', '==', patientId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Appointment, 'id'>) }));
};

export const listDoctorAppointments = async (doctorId: string): Promise<Appointment[]> => {
  const q = query(collection(db, COLLECTIONS.appointments), where('doctorId', '==', doctorId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Appointment, 'id'>) }));
};

export const listAllAppointments = async (): Promise<Appointment[]> => {
  const snap = await getDocs(collection(db, COLLECTIONS.appointments));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Appointment, 'id'>) }));
};

export const listDoctorAppointmentsByDate = async (
  doctorId: string,
  date: string
): Promise<Appointment[]> => {
  const q = query(
    collection(db, COLLECTIONS.appointments),
    where('doctorId', '==', doctorId),
    where('date', '==', date)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Appointment, 'id'>) }));
};

export const upsertDoctorAvailability = async (
  doctorId: string,
  date: string,
  slots: string[]
): Promise<void> => {
  const availabilityRef = doc(db, COLLECTIONS.availability, `${doctorId}_${date}`);
  await setDoc(
    availabilityRef,
    {
      doctorId,
      date,
      slots,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    },
    { merge: true }
  );
};

export const getDoctorAvailability = async (doctorId: string, date: string): Promise<string[]> => {
  const availabilityRef = doc(db, COLLECTIONS.availability, `${doctorId}_${date}`);
  const snap = await getDoc(availabilityRef);
  if (!snap.exists()) return [];
  const data = snap.data() as { slots?: string[] };
  return data.slots || [];
};

export const submitFeedback = async (input: NewFeedbackInput): Promise<string> => {
  const docRef = await addDoc(collection(db, COLLECTIONS.feedback), {
    patientId: input.patientId,
    patientName: input.patientName,
    patientEmail: input.patientEmail,
    rating: input.rating,
    comment: input.comment,
    approved: false,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
};

export const listApprovedFeedback = async (): Promise<Feedback[]> => {
  const q = query(collection(db, COLLECTIONS.feedback), where('approved', '==', true));
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data() as {
      patientName: string;
      rating: number;
      comment: string;
      createdAt?: Timestamp;
    };
    return {
      id: d.id,
      patientName: data.patientName,
      rating: data.rating,
      comment: data.comment,
      date: data.createdAt ? data.createdAt.toDate().toLocaleDateString() : '',
    };
  });
};

export const createRegistration = async (name: string, age: number, fee = 200): Promise<string> => {
  const docRef = await addDoc(collection(db, COLLECTIONS.registrations), {
    name,
    age,
    fee,
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    createdAt: serverTimestamp(),
  });
  return docRef.id;
};

export const listRegistrations = async (): Promise<LabRegistration[]> => {
  const snap = await getDocs(collection(db, COLLECTIONS.registrations));
  return snap.docs.map((d) => {
    const data = d.data() as Omit<LabRegistration, 'id'>;
    return { id: d.id, ...data };
  });
};
