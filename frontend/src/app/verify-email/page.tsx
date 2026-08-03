'use client';

import React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { verifyEmail } from '@/services/authService';

function VerifyEmailContent() {
  const params = useSearchParams();
  const [message, setMessage] = React.useState('Verifying your email…');
  const [success, setSuccess] = React.useState(false);

  React.useEffect(() => {
    const uid = params.get('uid') || '';
    const token = params.get('token') || '';
    if (!uid || !token) { setMessage('This verification link is incomplete.'); return; }
    verifyEmail(uid, token).then(() => { setSuccess(true); setMessage('Your email is verified. You can now sign in.'); window.history.replaceState({}, '', '/verify-email'); }).catch((error) => setMessage(error instanceof Error ? error.message : 'This verification link is invalid or expired.'));
  }, [params]);

  return <main className="min-h-[70vh] flex items-center justify-center p-6"><div className="max-w-md w-full bg-white border border-gray-100 shadow-lg rounded-3xl p-8 text-center"><h1 className="text-2xl font-black mb-4">Email verification</h1><p className={success ? 'text-green-700' : 'text-gray-600'}>{message}</p>{success && <Link href="/login" className="inline-block mt-6 px-6 py-3 bg-sky-600 text-white rounded-xl font-bold">Patient Login</Link>}</div></main>;
}

export default function VerifyEmailPage() {
  return <React.Suspense fallback={<main className="min-h-[70vh] flex items-center justify-center p-6">Loading verification…</main>}><VerifyEmailContent /></React.Suspense>;
}
