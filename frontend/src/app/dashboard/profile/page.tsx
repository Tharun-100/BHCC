'use client';

import PatientProfile from '@/features/dashboards/PatientProfile';
import StaffProfile from '@/features/dashboards/StaffProfile';
import { useAuth } from '@/providers/AuthProvider';
import { UserRole } from '@/types';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function Page() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && user === null) router.replace('/login?next=/dashboard/profile');
  }, [isLoading, user, router]);

  if (isLoading || !user) return null;

  if (user.role === UserRole.PATIENT) return <PatientProfile initialUser={user} />;

  return <StaffProfile user={user} />;
}
