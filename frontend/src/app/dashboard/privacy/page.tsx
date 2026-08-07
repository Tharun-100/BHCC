'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/storage';
type Row = { id: string; status: string; reason: string; requestedAt: string; reviewNotes?: string };
export default function PatientPrivacyPage() {
  const [rows, setRows] = useState<Row[]>([]); const [reason, setReason] = useState(''); const [message, setMessage] = useState('');
  const load = async () => setRows(await apiFetch<Row[]>('/api/patient/data-deletion-requests/', { authToken: getAccessToken() || undefined, cache: 'no-store' }));
  useEffect(() => { load().catch((e) => setMessage(e instanceof Error ? e.message : 'Unable to load requests.')); }, []);
  const submit = async () => { if (!confirm('Submit this privacy/deletion review request?')) return; await apiFetch('/api/patient/data-deletion-requests/', { method: 'POST', authToken: getAccessToken() || undefined, body: JSON.stringify({ reason }) }); setReason(''); setMessage('Request submitted.'); await load(); };
  return <main className="mx-auto max-w-3xl p-6 lg:p-12"><h1 className="text-3xl font-black">Privacy & data requests</h1><p className="mt-3 text-gray-600">Request account deactivation, correction, access or deletion review. Required clinical, prescription, payment and audit records may be retained.</p><textarea value={reason} onChange={(e) => setReason(e.target.value)} className="mt-8 min-h-32 w-full rounded-2xl border p-4" placeholder="Describe your request" /><button disabled={!reason.trim()} onClick={() => submit().catch((e) => setMessage(e instanceof Error ? e.message : 'Request failed.'))} className="mt-3 rounded-xl bg-sky-600 px-5 py-3 font-bold text-white disabled:opacity-50">Submit request</button>{message && <p className="mt-4">{message}</p>}<div className="mt-8 space-y-3">{rows.map((row) => <div key={row.id} className="rounded-2xl border p-4"><b>{row.status}</b><p>{row.reason}</p><small>{new Date(row.requestedAt).toLocaleString()}</small>{row.reviewNotes && <p className="mt-2">Clinic response: {row.reviewNotes}</p>}</div>)}</div></main>;
}
