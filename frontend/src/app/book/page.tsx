'use client';

import { Suspense } from 'react';
import BookAppointment from '@/features/BookAppointment';

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50" />}>
      <BookAppointment />
    </Suspense>
  );
}
