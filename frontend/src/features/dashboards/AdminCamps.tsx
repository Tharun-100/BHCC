'use client';

import React from 'react';
import { Department, FreeCamp } from '@/types';
import { createFreeCamp, deleteFreeCamp, listDepartments, listFreeCamps, updateFreeCamp } from '@/services/clinicService';

type CampForm = { name: string; date: string; location: string; capacity: string; departmentIds: string[] };
const emptyForm: CampForm = { name: '', date: '', location: 'Bhaktivedanta Health Care Center', capacity: '', departmentIds: [] };

function DepartmentChoices({ departments, selected, onChange }: { departments: Department[]; selected: string[]; onChange: (ids: string[]) => void }) {
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id]);
  return <fieldset className="rounded-xl border p-3"><legend className="px-1 text-sm font-bold">Camp departments</legend><div className="grid gap-2 sm:grid-cols-2">{departments.map((department) => <label key={department.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selected.includes(department.id)} onChange={() => toggle(department.id)} />{department.name}</label>)}</div></fieldset>;
}

export default function AdminCamps() {
  const [departments, setDepartments] = React.useState<Department[]>([]);
  const [camps, setCamps] = React.useState<FreeCamp[]>([]);
  const [message, setMessage] = React.useState('');
  const [editingCampId, setEditingCampId] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<CampForm>(emptyForm);
  const [campEdit, setCampEdit] = React.useState<CampForm>(emptyForm);

  const load = () => Promise.all([listDepartments(), listFreeCamps()]).then(([departmentData, campData]) => {
    setDepartments(departmentData);
    setCamps(campData);
  });
  React.useEffect(() => { load().catch(() => setMessage('Unable to load camps.')); }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.departmentIds.length) return setMessage('Select at least one department for the camp.');
    try {
      await createFreeCamp({ ...form, capacity: form.capacity ? Number(form.capacity) : undefined });
      await load();
      setForm(emptyForm);
      setMessage('Camp created. You can now open it for registration.');
    } catch (error: any) { setMessage(error?.message || 'Could not create camp.'); }
  };

  const setStatus = async (camp: FreeCamp, status: FreeCamp['status']) => {
    try { await updateFreeCamp(camp.id, { status }); await load(); }
    catch (error: any) { setMessage(error?.message || 'Could not update camp status.'); }
  };

  const startCampEdit = (camp: FreeCamp) => {
    setEditingCampId(camp.id);
    setCampEdit({ name: camp.name, date: camp.date, location: camp.location, capacity: camp.capacity == null ? '' : String(camp.capacity), departmentIds: camp.departments.map((department) => department.id) });
    setMessage('');
  };

  const saveCamp = async (camp: FreeCamp) => {
    const capacity = campEdit.capacity.trim() === '' ? null : Number(campEdit.capacity);
    if (!campEdit.name.trim() || !campEdit.location.trim() || !campEdit.date) return setMessage('Camp name, date, and location are required.');
    if (!campEdit.departmentIds.length) return setMessage('Select at least one department for the camp.');
    if (capacity !== null && (!Number.isInteger(capacity) || capacity < Math.max(1, camp.registrationCount))) return setMessage(`Camp capacity must be at least ${Math.max(1, camp.registrationCount)}, or empty for unlimited.`);
    try {
      await updateFreeCamp(camp.id, { name: campEdit.name.trim(), date: campEdit.date, location: campEdit.location.trim(), capacity, departmentIds: campEdit.departmentIds });
      await load();
      setEditingCampId(null);
      setMessage('Camp details updated successfully.');
    } catch (error: any) { setMessage(error?.message || 'Could not update camp.'); }
  };

  const removeCamp = async (camp: FreeCamp) => {
    if (camp.registrationCount > 0) return setMessage('This camp has patient registrations and cannot be permanently deleted. Close or cancel it to preserve patient records.');
    if (!window.confirm(`Permanently delete “${camp.name}”? This action cannot be undone.`)) return;
    try { await deleteFreeCamp(camp.id); await load(); setEditingCampId(null); setMessage('Empty camp deleted permanently.'); }
    catch (error: any) { setMessage(error?.message || 'Could not delete camp.'); }
  };

  return <div className="mx-auto max-w-7xl px-4 py-12">
    <h1 className="text-3xl font-black">Camp Management</h1>
    <p className="mb-8 text-gray-500">Create camps and select the departments available for patient registration.</p>
    {message && <p className="mb-5 rounded-xl bg-sky-50 p-3 text-sky-800">{message}</p>}
    <form onSubmit={submit} className="mx-auto max-w-3xl space-y-4 rounded-3xl border bg-white p-7">
      <h2 className="text-xl font-bold">Create camp</h2>
      <input required placeholder="Camp name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="w-full rounded-xl border p-3" />
      <input required type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} className="w-full rounded-xl border p-3" />
      <input required placeholder="Location" value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} className="w-full rounded-xl border p-3" />
      <input type="number" min="1" placeholder="Total camp capacity (optional)" value={form.capacity} onChange={(event) => setForm({ ...form, capacity: event.target.value })} className="w-full rounded-xl border p-3" />
      <DepartmentChoices departments={departments} selected={form.departmentIds} onChange={(departmentIds) => setForm({ ...form, departmentIds })} />
      <button className="w-full rounded-xl bg-sky-600 py-3 font-bold text-white">Create camp</button>
    </form>

    <div className="mt-8 space-y-4">{camps.map((camp) => <article key={camp.id} className="rounded-3xl border bg-white p-6">
      <div className="flex flex-wrap justify-between gap-4">
        <div><h2 className="text-xl font-bold">{camp.name}</h2><p className="text-gray-500">{camp.date} · {camp.location} · {camp.status}</p><p className="text-sm">{camp.registrationCount}{camp.capacity ? ` / ${camp.capacity}` : ''} registrations</p><p className="mt-2 text-sm"><b>Departments:</b> {camp.departments.map((department) => department.name).join(', ') || 'None selected'}</p></div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => startCampEdit(camp)} className="rounded-lg border border-sky-200 px-3 py-2 text-sm font-bold text-sky-700">Edit camp</button>
          {camp.status !== 'OPEN' && <button type="button" onClick={() => setStatus(camp, 'OPEN')} className="rounded-lg bg-green-600 px-3 py-2 text-sm font-bold text-white">Open</button>}
          {camp.status !== 'CLOSED' && <button type="button" onClick={() => setStatus(camp, 'CLOSED')} className="rounded-lg border px-3 py-2 text-sm font-bold">Close</button>}
          {camp.status !== 'CANCELLED' && <button type="button" onClick={() => setStatus(camp, 'CANCELLED')} className="rounded-lg border border-red-200 px-3 py-2 text-sm font-bold text-red-700">Cancel</button>}
          <button type="button" onClick={() => removeCamp(camp)} className="rounded-lg border border-red-300 px-3 py-2 text-sm font-bold text-red-700">Delete</button>
        </div>
      </div>
      {editingCampId === camp.id && <div className="mt-4 grid gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 md:grid-cols-2">
        <label className="text-sm font-semibold">Camp name<input value={campEdit.name} onChange={(event) => setCampEdit({ ...campEdit, name: event.target.value })} className="mt-1 w-full rounded-lg border p-2" /></label>
        <label className="text-sm font-semibold">Camp date<input type="date" value={campEdit.date} onChange={(event) => setCampEdit({ ...campEdit, date: event.target.value })} className="mt-1 w-full rounded-lg border p-2" /></label>
        <label className="text-sm font-semibold">Location<input value={campEdit.location} onChange={(event) => setCampEdit({ ...campEdit, location: event.target.value })} className="mt-1 w-full rounded-lg border p-2" /></label>
        <label className="text-sm font-semibold">Total capacity<input type="number" min={Math.max(1, camp.registrationCount)} placeholder="Empty means unlimited" value={campEdit.capacity} onChange={(event) => setCampEdit({ ...campEdit, capacity: event.target.value })} className="mt-1 w-full rounded-lg border p-2" /></label>
        <div className="md:col-span-2"><DepartmentChoices departments={departments} selected={campEdit.departmentIds} onChange={(departmentIds) => setCampEdit({ ...campEdit, departmentIds })} /></div>
        <div className="flex gap-2 md:col-span-2"><button type="button" onClick={() => saveCamp(camp)} className="rounded-lg bg-sky-700 px-3 py-2 text-sm font-bold text-white">Save camp</button><button type="button" onClick={() => setEditingCampId(null)} className="rounded-lg border bg-white px-3 py-2 text-sm font-bold">Cancel editing</button></div>
      </div>}
    </article>)}</div>
  </div>;
}
