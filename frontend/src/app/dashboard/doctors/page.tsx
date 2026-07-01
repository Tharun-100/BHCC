'use client';

import AdminDoctors from '@/features/dashboards/AdminDoctors';
import { useAuth } from '@/providers/AuthProvider';
import { UserRole } from '@/types';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function Page() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) router.replace('/login?next=/dashboard/doctors');
    else if (!isLoading && user && user.role !== UserRole.ADMIN) router.replace('/dashboard');
  }, [isLoading, user, router]);

  if (isLoading || !user || user.role !== UserRole.ADMIN) return null;
  return <AdminDoctors user={user} />;
}
