'use client';

import React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { confirmPasswordReset } from '@/services/authService';
import PasswordInput from '@/components/PasswordInput';

function ResetPasswordContent() {
  const params = useSearchParams();
  const [password, setPassword] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [success, setSuccess] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const submit = async (event: React.FormEvent) => { event.preventDefault(); if (password !== confirm) { setMessage('Passwords do not match.'); return; } setLoading(true); try { await confirmPasswordReset(params.get('uid') || '', params.get('token') || '', password); setSuccess(true); setMessage('Password updated successfully.'); window.history.replaceState({}, '', '/reset-password'); } catch (error) { setMessage(error instanceof Error ? error.message : 'Reset failed.'); } finally { setLoading(false); } };
return <main className="min-h-[70vh] flex items-center justify-center p-6"><form onSubmit={submit} className="max-w-md w-full bg-white border border-gray-100 shadow-lg rounded-3xl p-8"><h1 className="text-2xl font-black mb-6">Choose a new password</h1><label className="block text-sm font-bold mb-2" htmlFor="new-password">New password</label><PasswordInput id="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} className="border rounded-xl px-4 py-3 mb-4"/><label className="block text-sm font-bold mb-2" htmlFor="confirm-password">Confirm password</label><PasswordInput id="confirm-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} className="border rounded-xl px-4 py-3 mb-4"/><button disabled={loading || success} className="w-full bg-sky-600 text-white rounded-xl py-3 font-bold disabled:opacity-50">{loading ? 'Updating…' : 'Update password'}</button>{message && <p className="mt-4 text-sm text-gray-600">{message}</p>}{success && <Link href="/login" className="block text-center mt-4 text-sky-600 font-bold">Return to Patient Login</Link>}</form></main>;
}

export default function ResetPasswordPage() {
  return <React.Suspense fallback={<main className="min-h-[70vh] flex items-center justify-center p-6">Loading password reset…</main>}><ResetPasswordContent /></React.Suspense>;
}
