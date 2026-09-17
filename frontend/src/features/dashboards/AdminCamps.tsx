'use client';

import React from 'react';
import { Department, FreeCamp } from '@/types';
import { createCampRoom, createFreeCamp, deleteFreeCamp, listDepartments, listFreeCamps, updateCampRoom, updateFreeCamp } from '@/services/clinicService';

type CampRoom = FreeCamp['rooms'][number];
const emptyRoomEdit = { departmentId: '', roomNumber: '', capacity: '', isActive: true };

export default function AdminCamps() {
  const [departments, setDepartments] = React.useState<Department[]>([]);
  const [camps, setCamps] = React.useState<FreeCamp[]>([]);
  const [message, setMessage] = React.useState('');
  const [editingRoomId, setEditingRoomId] = React.useState<string | null>(null);
  const [roomEdit, setRoomEdit] = React.useState(emptyRoomEdit);
  const [editingCampId, setEditingCampId] = React.useState<string | null>(null);
  const [campEdit, setCampEdit] = React.useState({ name: '', date: '', location: '', capacity: '' });
  const [form, setForm] = React.useState({ name: '', date: '', location: 'Bhaktivedanta Health Care Center', capacity: '' });
  const [roomForm, setRoomForm] = React.useState({ campId: '', departmentId: '', roomNumber: '', capacity: '' });

  const load = () => Promise.all([listDepartments(), listFreeCamps()]).then(([departmentData, campData]) => {
    setDepartments(departmentData);
    setCamps(campData);
  });

  React.useEffect(() => { load().catch(() => setMessage('Unable to load camps.')); }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await createFreeCamp({ ...form, capacity: form.capacity ? Number(form.capacity) : undefined, departmentIds: [] });
      await load();
      setForm({ name: '', date: '', location: 'Bhaktivedanta Health Care Center', capacity: '' });
      setMessage('Camp created. Add rooms and open registration.');
    } catch (error: any) { setMessage(error?.message || 'Could not create camp.'); }
  };

  const addRoom = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await createCampRoom(roomForm.campId, {
        departmentId: roomForm.departmentId,
        roomNumber: roomForm.roomNumber,
        capacity: roomForm.capacity ? Number(roomForm.capacity) : undefined,
      });
      await load();
      setRoomForm({ ...roomForm, departmentId: '', roomNumber: '', capacity: '' });
      setMessage('Room mapped successfully.');
    } catch (error: any) { setMessage(error?.message || 'Could not map room.'); }
  };

  const setStatus = async (camp: FreeCamp, status: FreeCamp['status']) => {
    await updateFreeCamp(camp.id, { status });
    await load();
  };

  const startCampEdit = (camp: FreeCamp) => {
    setEditingCampId(camp.id);
    setCampEdit({ name: camp.name, date: camp.date, location: camp.location, capacity: camp.capacity == null ? '' : String(camp.capacity) });
    setMessage('');
  };

  const saveCamp = async (camp: FreeCamp) => {
    const capacity = campEdit.capacity.trim() === '' ? null : Number(campEdit.capacity);
    if (!campEdit.name.trim() || !campEdit.location.trim() || !campEdit.date) return setMessage('Camp name, date, and location are required.');
    if (capacity !== null && (!Number.isInteger(capacity) || capacity < Math.max(1, camp.registrationCount))) return setMessage(`Camp capacity must be at least ${Math.max(1, camp.registrationCount)}, or empty for unlimited.`);
    try {
      await updateFreeCamp(camp.id, { name: campEdit.name.trim(), date: campEdit.date, location: campEdit.location.trim(), capacity });
      await load();
      setEditingCampId(null);
      setMessage('Camp details updated successfully.');
    } catch (error: any) { setMessage(error?.message || 'Could not update camp.'); }
  };

  const removeCamp = async (camp: FreeCamp) => {
    if (camp.registrationCount > 0) return setMessage('This camp has patient registrations and cannot be permanently deleted. Close or cancel it to preserve patient records.');
    if (!window.confirm(`Permanently delete “${camp.name}” and all its room mappings? This action cannot be undone.`)) return;
    try {
      await deleteFreeCamp(camp.id);
      await load();
      if (editingCampId === camp.id) setEditingCampId(null);
      setMessage('Empty camp deleted permanently.');
    } catch (error: any) { setMessage(error?.message || 'Could not delete camp.'); }
  };

  const startRoomEdit = (room: CampRoom) => {
    setEditingRoomId(room.id);
    setRoomEdit({
      departmentId: room.departmentId,
      roomNumber: room.roomNumber,
      capacity: room.capacity == null ? '' : String(room.capacity),
      isActive: room.isActive,
    });
    setMessage('');
  };

  const cancelRoomEdit = () => { setEditingRoomId(null); setRoomEdit(emptyRoomEdit); };

  const saveRoom = async (room: CampRoom) => {
    const roomNumber = roomEdit.roomNumber.trim();
    const capacity = roomEdit.capacity.trim() === '' ? null : Number(roomEdit.capacity);
    if (!roomNumber) return setMessage('Enter a room number or name.');
    if (capacity !== null && (!Number.isInteger(capacity) || capacity < 1)) return setMessage('Room capacity must be a positive whole number, or empty for unlimited.');
    if (capacity !== null && capacity < room.registrationCount) return setMessage(`Capacity cannot be lower than the current ${room.registrationCount} registrations.`);
    try {
      await updateCampRoom(room.id, { departmentId: roomEdit.departmentId, roomNumber, capacity, isActive: roomEdit.isActive });
      await load();
      cancelRoomEdit();
      setMessage('Room details updated successfully.');
    } catch (error: any) { setMessage(error?.message || 'Could not update room details.'); }
  };

  return <div className="mx-auto max-w-7xl px-4 py-12">
    <h1 className="text-3xl font-black">Camp Management</h1>
    <p className="mb-8 text-gray-500">Create camps, map multiple department rooms, and manage room details as queues grow.</p>
    {message && <p className="mb-5 rounded-xl bg-sky-50 p-3 text-sky-800">{message}</p>}

    <div className="grid gap-8 lg:grid-cols-2">
      <form onSubmit={submit} className="space-y-4 rounded-3xl border bg-white p-7">
        <h2 className="text-xl font-bold">1. Create camp</h2>
        <input required placeholder="Camp name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="w-full rounded-xl border p-3" />
        <input required type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} className="w-full rounded-xl border p-3" />
        <input required placeholder="Location" value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} className="w-full rounded-xl border p-3" />
        <input type="number" min="1" placeholder="Total camp capacity (optional)" value={form.capacity} onChange={(event) => setForm({ ...form, capacity: event.target.value })} className="w-full rounded-xl border p-3" />
        <button className="w-full rounded-xl bg-sky-600 py-3 font-bold text-white">Create camp</button>
      </form>

      <form onSubmit={addRoom} className="space-y-4 rounded-3xl border bg-white p-7">
        <h2 className="text-xl font-bold">2. Add another department room</h2>
        <select required value={roomForm.campId} onChange={(event) => setRoomForm({ ...roomForm, campId: event.target.value })} className="w-full rounded-xl border p-3">
          <option value="">Select camp</option>
          {camps.filter((camp) => !['CLOSED', 'CANCELLED'].includes(camp.status)).map((camp) => <option key={camp.id} value={camp.id}>{camp.name} — {camp.date}</option>)}
        </select>
        <select required value={roomForm.departmentId} onChange={(event) => setRoomForm({ ...roomForm, departmentId: event.target.value })} className="w-full rounded-xl border p-3">
          <option value="">Select department</option>
          {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
        </select>
        <input required placeholder="Room number or name" value={roomForm.roomNumber} onChange={(event) => setRoomForm({ ...roomForm, roomNumber: event.target.value })} className="w-full rounded-xl border p-3" />
        <input type="number" min="1" placeholder="Capacity (empty means unlimited)" value={roomForm.capacity} onChange={(event) => setRoomForm({ ...roomForm, capacity: event.target.value })} className="w-full rounded-xl border p-3" />
        <button className="w-full rounded-xl bg-slate-900 py-3 font-bold text-white">Add room</button>
      </form>
    </div>

    <div className="mt-8 space-y-4">{camps.map((camp) => <article key={camp.id} className="rounded-3xl border bg-white p-6">
      <div className="flex flex-wrap justify-between gap-4">
        <div><h2 className="text-xl font-bold">{camp.name}</h2><p className="text-gray-500">{camp.date} · {camp.location} · {camp.status}</p><p className="text-sm">{camp.registrationCount}{camp.capacity ? ` / ${camp.capacity}` : ''} registrations</p></div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => startCampEdit(camp)} className="rounded-lg border border-sky-200 px-3 py-2 text-sm font-bold text-sky-700">Edit camp</button>
          {camp.status !== 'OPEN' && <button onClick={() => setStatus(camp, 'OPEN')} className="rounded-lg bg-green-600 px-3 py-2 text-sm font-bold text-white">Open</button>}
          {camp.status !== 'CLOSED' && <button onClick={() => setStatus(camp, 'CLOSED')} className="rounded-lg border px-3 py-2 text-sm font-bold">Close</button>}
          {camp.status !== 'CANCELLED' && <button onClick={() => setStatus(camp, 'CANCELLED')} className="rounded-lg border border-red-200 px-3 py-2 text-sm font-bold text-red-700">Cancel</button>}
          <button type="button" onClick={() => removeCamp(camp)} className="rounded-lg border border-red-300 px-3 py-2 text-sm font-bold text-red-700">Delete</button>
        </div>
      </div>
      {editingCampId === camp.id && <div className="mt-4 grid gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 md:grid-cols-2">
        <label className="text-sm font-semibold">Camp name<input value={campEdit.name} onChange={(event) => setCampEdit({ ...campEdit, name: event.target.value })} className="mt-1 w-full rounded-lg border p-2" /></label>
        <label className="text-sm font-semibold">Camp date<input type="date" value={campEdit.date} onChange={(event) => setCampEdit({ ...campEdit, date: event.target.value })} className="mt-1 w-full rounded-lg border p-2" /></label>
        <label className="text-sm font-semibold">Location<input value={campEdit.location} onChange={(event) => setCampEdit({ ...campEdit, location: event.target.value })} className="mt-1 w-full rounded-lg border p-2" /></label>
        <label className="text-sm font-semibold">Total capacity<input type="number" min={Math.max(1, camp.registrationCount)} placeholder="Empty means unlimited" value={campEdit.capacity} onChange={(event) => setCampEdit({ ...campEdit, capacity: event.target.value })} className="mt-1 w-full rounded-lg border p-2" /></label>
        <div className="flex gap-2 md:col-span-2"><button type="button" onClick={() => saveCamp(camp)} className="rounded-lg bg-sky-700 px-3 py-2 text-sm font-bold text-white">Save camp</button><button type="button" onClick={() => setEditingCampId(null)} className="rounded-lg border bg-white px-3 py-2 text-sm font-bold">Cancel editing</button></div>
      </div>}
      <div className="mt-4 grid gap-3 md:grid-cols-2">{camp.rooms.map((room) => editingRoomId === room.id ? <div key={room.id} className="space-y-3 rounded-xl border border-sky-200 bg-sky-50 p-4">
        <label className="block text-sm font-semibold">Department
          <select value={roomEdit.departmentId} disabled={room.registrationCount > 0} onChange={(event) => setRoomEdit({ ...roomEdit, departmentId: event.target.value })} className="mt-1 w-full rounded-lg border bg-white p-2 disabled:bg-gray-100">
            {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
          </select>
        </label>
        {room.registrationCount > 0 && <p className="text-xs text-amber-700">Department is locked because patients are already assigned. Create another room to use a different department.</p>}
        <label className="block text-sm font-semibold">Room number or name<input value={roomEdit.roomNumber} onChange={(event) => setRoomEdit({ ...roomEdit, roomNumber: event.target.value })} className="mt-1 w-full rounded-lg border p-2" /></label>
        <label className="block text-sm font-semibold">Capacity<input type="number" min={Math.max(1, room.registrationCount)} placeholder="Empty means unlimited" value={roomEdit.capacity} onChange={(event) => setRoomEdit({ ...roomEdit, capacity: event.target.value })} className="mt-1 w-full rounded-lg border p-2" /></label>
        <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={roomEdit.isActive} onChange={(event) => setRoomEdit({ ...roomEdit, isActive: event.target.checked })} />Room is active</label>
        <div className="flex gap-2"><button type="button" onClick={() => saveRoom(room)} className="rounded-lg bg-sky-700 px-3 py-2 text-sm font-bold text-white">Save changes</button><button type="button" onClick={cancelRoomEdit} className="rounded-lg border bg-white px-3 py-2 text-sm font-bold">Cancel</button></div>
      </div> : <div key={room.id} className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 p-3">
        <span><b>{room.departmentName}</b> — Room {room.roomNumber}<small className="block text-gray-500">{room.registrationCount}{room.capacity ? ` / ${room.capacity}` : ' / unlimited'} patients · {room.isActive ? 'Active' : 'Closed'}</small></span>
        <button type="button" onClick={() => startRoomEdit(room)} className="rounded-lg border border-sky-200 px-3 py-2 text-sm font-bold text-sky-700">Edit</button>
      </div>)}{camp.rooms.length === 0 && <p className="text-sm text-amber-700">No rooms configured.</p>}</div>
    </article>)}</div>
  </div>;
}
