'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/storage';
type Operations = { auditEvents: Array<{ id: string; action: string; summary: string; createdAt: string }>; emailDeliveries: Array<{ id: string; template: string; delivered: boolean; errorType: string; createdAt: string }>; deletionRequests: Array<{ id: string; patient: string; status: string; reason: string }> };
export default function OperationsPage() {
  const [data, setData] = useState<Operations | null>(null); const [error, setError] = useState('');
  useEffect(() => { apiFetch<Operations>('/api/management/operations/', { authToken: getAccessToken() || undefined, cache: 'no-store' }).then(setData).catch((e) => setError(e instanceof Error ? e.message : 'Unable to load operations.')); }, []);
  if (error) return <main className="p-8 text-red-700">{error}</main>; if (!data) return <main className="p-8">Loading operational records...</main>;
  return <main className="mx-auto max-w-6xl space-y-8 p-6 lg:p-12"><h1 className="text-3xl font-black">Operations & audit</h1><section><h2 className="text-xl font-bold">Data requests</h2>{data.deletionRequests.map((r) => <div key={r.id} className="mt-2 rounded-xl border p-3"><b>{r.patient} - {r.status}</b><p>{r.reason}</p></div>)}</section><section><h2 className="text-xl font-bold">Email delivery</h2>{data.emailDeliveries.map((r) => <div key={r.id} className="mt-2 rounded-xl border p-3">{r.delivered ? 'Delivered' : 'Failed'} - {r.template} - {r.errorType || 'no error'} - {new Date(r.createdAt).toLocaleString()}</div>)}</section><section><h2 className="text-xl font-bold">Administrator activity</h2>{data.auditEvents.map((r) => <div key={r.id} className="mt-2 rounded-xl border p-3"><b>{r.action}</b> - {r.summary} - {new Date(r.createdAt).toLocaleString()}</div>)}</section></main>;
}
