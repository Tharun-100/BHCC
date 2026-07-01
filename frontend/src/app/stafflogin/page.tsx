'use client';

import { Suspense } from 'react';
import StaffLogin from '@/features/StaffLogin';

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50" />}>
      <StaffLogin />
    </Suspense>
  );
}
