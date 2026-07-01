'use client';

import { Suspense } from 'react';
import PaymentGatewayPage from '@/features/PaymentGatewayPage';

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50" />}>
      <PaymentGatewayPage />
    </Suspense>
  );
}
