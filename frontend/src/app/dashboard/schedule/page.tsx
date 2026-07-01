'use client';

import DoctorSchedule from '@/features/dashboards/DoctorSchedule';
import { useAuth } from '@/providers/AuthProvider';
import { UserRole } from '@/types';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function Page() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) router.replace('/login?next=/dashboard/schedule');
    else if (!isLoading && user && user.role !== UserRole.DOCTOR) router.replace('/dashboard');
  }, [isLoading, user, router]);

  if (isLoading || !user || user.role !== UserRole.DOCTOR) return null;
  return <DoctorSchedule user={user} />;
}
