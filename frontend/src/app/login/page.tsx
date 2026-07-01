'use client';

import { Suspense } from 'react';
import Login from '@/features/Login';

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50" />}>
      <Login />
    </Suspense>
  );
}
