'use client';

import React from 'react';
import { requestPasswordReset } from '@/services/authService';

export default function ForgotPasswordPage() {
  const [email, setEmail] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const submit = async (event: React.FormEvent) => { event.preventDefault(); setLoading(true); try { await requestPasswordReset(email); setMessage('If an account exists for this email, a reset link has been sent.'); } catch (error) { setMessage(error instanceof Error ? error.message : 'Request failed.'); } finally { setLoading(false); } };
  return <main className="min-h-[70vh] flex items-center justify-center p-6"><form onSubmit={submit} className="max-w-md w-full bg-white border border-gray-100 shadow-lg rounded-3xl p-8"><h1 className="text-2xl font-black mb-2">Forgot password</h1><p className="text-gray-500 mb-6">Enter your patient account email.</p><label className="block text-sm font-bold mb-2" htmlFor="reset-email">Email</label><input id="reset-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full border rounded-xl px-4 py-3 mb-4"/><button disabled={loading} className="w-full bg-sky-600 text-white rounded-xl py-3 font-bold disabled:opacity-50">{loading ? 'Sending…' : 'Send reset link'}</button>{message && <p className="mt-4 text-sm text-gray-600">{message}</p>}</form></main>;
}
