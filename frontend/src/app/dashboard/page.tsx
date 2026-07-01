'use client';

import PatientDashboard from '@/features/dashboards/PatientDashboard';
import DoctorDashboard from '@/features/dashboards/DoctorDashboard';
import AdminDashboard from '@/features/dashboards/AdminDashboard';
import CounterDashboard from '@/features/dashboards/CounterDashboard';
import StaffDashboard from '@/features/dashboards/StaffDashboard';
import { useAuth } from '@/providers/AuthProvider';
import { UserRole } from '@/types';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function Page() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && user === null) router.replace('/login?next=/dashboard');
  }, [isLoading, user, router]);

  if (isLoading || !user) return null;

  if (user.role === UserRole.PATIENT) return <PatientDashboard user={user} />;
  if (user.role === UserRole.DOCTOR) return <DoctorDashboard user={user} />;
  if (user.role === UserRole.ADMIN) return <AdminDashboard user={user} />;
  if (user.role === UserRole.COUNTER) return <CounterDashboard user={user} />;
  if (user.role === UserRole.STAFF) return <StaffDashboard user={user} />;

  return null;
}
