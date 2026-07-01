'use client';

import { Suspense } from 'react';
import PaymentCallbackPage from '@/features/PaymentCallbackPage';

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50" />}>
      <PaymentCallbackPage />
    </Suspense>
  );
}
