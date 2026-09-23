'use client';

import React from 'react';
import { Department, LabRegistration } from '@/types';
import { updateRegistration } from '@/services/clinicService';

export default function RegistrationEditor({ registration, departments, onSaved, onCancel }: { registration: LabRegistration; departments: Department[]; onSaved: (row: LabRegistration) => void; onCancel: () => void }) {
  const [form, setForm] = React.useState({ name: registration.name, phoneNo: registration.phoneNo, address: registration.address, age: String(registration.age ?? ''), gender: registration.gender || '', nativePlace: registration.nativePlace || '', departmentId: registration.departmentId || '' });
  const [message, setMessage] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setMessage('');
    try { const row = await updateRegistration(registration.id, form); onSaved(row); }
    catch (error: any) { setMessage(error?.message || 'Could not update patient details.'); }
    finally { setSaving(false); }
  };
  const label = (text: string) => <>{text} <span className="text-red-600" aria-hidden="true">*</span></>;
  return <form onSubmit={save} className="grid gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 md:grid-cols-2">
    <label className="text-sm font-bold">{label('Name')}<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="mt-1 w-full rounded-lg border bg-white p-2" /></label>
    <label className="text-sm font-bold">{label('Mobile number')}<input required inputMode="numeric" pattern="[0-9]{10}" value={form.phoneNo} onChange={(event) => setForm({ ...form, phoneNo: event.target.value.replace(/\D/g, '').slice(0, 10) })} className="mt-1 w-full rounded-lg border bg-white p-2" /></label>
    <label className="text-sm font-bold">{label('Age')}<input required type="number" min="0" max="120" value={form.age} onChange={(event) => setForm({ ...form, age: event.target.value })} className="mt-1 w-full rounded-lg border bg-white p-2" /></label>
    <label className="text-sm font-bold">{label('Gender')}<select required value={form.gender} onChange={(event) => setForm({ ...form, gender: event.target.value })} className="mt-1 w-full rounded-lg border bg-white p-2"><option value="">Select gender</option><option value="MALE">Male</option><option value="FEMALE">Female</option><option value="OTHER">Other</option></select></label>
    <label className="text-sm font-bold md:col-span-2">{label('Address')}<textarea required value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} className="mt-1 w-full rounded-lg border bg-white p-2" /></label>
    <label className="text-sm font-bold">Native place <span className="font-normal text-gray-500">(optional)</span><input value={form.nativePlace} onChange={(event) => setForm({ ...form, nativePlace: event.target.value })} className="mt-1 w-full rounded-lg border bg-white p-2" /></label>
    <label className="text-sm font-bold">Department<select required value={form.departmentId} onChange={(event) => setForm({ ...form, departmentId: event.target.value })} className="mt-1 w-full rounded-lg border bg-white p-2">{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
    {message && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700 md:col-span-2">{message}</p>}
    <div className="flex gap-2 md:col-span-2"><button disabled={saving} className="rounded-lg bg-sky-700 px-4 py-2 font-bold text-white disabled:opacity-60">{saving ? 'Saving...' : 'Save changes'}</button><button type="button" onClick={onCancel} className="rounded-lg border bg-white px-4 py-2 font-bold">Cancel</button></div>
  </form>;
}
