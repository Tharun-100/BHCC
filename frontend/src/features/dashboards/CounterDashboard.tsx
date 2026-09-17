import React from 'react';
import { Department, FreeCamp, LabRegistration, User } from '../../types';
import { PlusCircle, Users } from 'lucide-react';
import { createRegistration, listDepartments, listFreeCamps, listRegistrations } from '../../services/clinicService';
import Link from 'next/link';

const emptyForm = { name: '', phoneNo: '', address: '', nativePlace: '', departmentId: '', campId: '', isFreeCamp: false };

const CounterDashboard: React.FC<{ user: User }> = () => {
  const [registrations, setRegistrations] = React.useState<LabRegistration[]>([]);
  const [departments, setDepartments] = React.useState<Department[]>([]);
  const [camps, setCamps] = React.useState<FreeCamp[]>([]);
  const [form, setForm] = React.useState(emptyForm);
  const [message, setMessage] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    Promise.all([listRegistrations(), listDepartments(), listFreeCamps()]).then(([rows, departmentRows, campRows]) => {
      setRegistrations(rows); setDepartments(departmentRows); setCamps(campRows.filter(camp => camp.isActive));
    }).catch(() => setMessage('Unable to load counter registration data.'));
  }, []);

  const selectedCamp = camps.find(camp => camp.id === form.campId);
  const availableDepartments = form.isFreeCamp && selectedCamp ? selectedCamp.departments : departments;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setMessage(''); setSaving(true);
    try {
      const row = await createRegistration(form);
      setRegistrations(previous => [row, ...previous]);
      setForm(emptyForm);
      setMessage(`Registered successfully. Patient ID: ${row.patientId}; token: ${row.tokenNumber}.`);
    } catch (error: any) { setMessage(error?.message || 'Registration failed.'); }
    finally { setSaving(false); }
  };

  return <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
    <div className="mb-8 flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-3xl font-extrabold text-gray-900">Counter Registration</h1><p className="text-gray-500">Register clinic and counter-only free-camp patients. Existing mobile numbers retain their BHCC patient ID.</p></div><Link href="/dashboard/payroll" className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 font-bold text-sky-700">My Payroll</Link></div>
    <div className="grid gap-8 lg:grid-cols-[minmax(0,420px)_1fr]">
      <form onSubmit={submit} className="space-y-4 rounded-3xl border border-gray-100 bg-white p-7 shadow-sm">
        <h2 className="flex items-center text-xl font-bold"><PlusCircle className="mr-2 text-sky-600"/>New registration</h2>
        <label className="flex items-center gap-3 rounded-xl bg-sky-50 p-4 font-bold text-sky-900"><input type="checkbox" checked={form.isFreeCamp} onChange={e => setForm({...form, isFreeCamp:e.target.checked, campId:'', departmentId:''})}/>Free camp registration</label>
        {form.isFreeCamp && <select required value={form.campId} onChange={e=>setForm({...form,campId:e.target.value,departmentId:''})} className="w-full rounded-xl border p-3"><option value="">Select free camp</option>{camps.map(c=><option key={c.id} value={c.id}>{c.name} — {c.date}</option>)}</select>}
        <input required placeholder="Patient name" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} className="w-full rounded-xl border p-3"/>
        <input required inputMode="numeric" pattern="[0-9]{10}" placeholder="10-digit mobile number" value={form.phoneNo} onChange={e=>setForm({...form,phoneNo:e.target.value.replace(/\D/g,'').slice(0,10)})} className="w-full rounded-xl border p-3"/>
        {form.isFreeCamp ? <textarea required placeholder="Address" value={form.address} onChange={e=>setForm({...form,address:e.target.value})} className="w-full rounded-xl border p-3"/> : <input required placeholder="Native place" value={form.nativePlace} onChange={e=>setForm({...form,nativePlace:e.target.value})} className="w-full rounded-xl border p-3"/>}
        <select required value={form.departmentId} onChange={e=>setForm({...form,departmentId:e.target.value})} className="w-full rounded-xl border p-3"><option value="">Select department</option>{availableDepartments.map(d=><option key={d.id} value={d.id}>{d.name}{d.location ? ` — ${d.location}` : ''}</option>)}</select>
        <div className="rounded-xl bg-gray-50 p-4 font-bold">Registration fee: {form.isFreeCamp ? 'Free' : '₹150'}</div>
        {message && <p className="rounded-xl bg-sky-50 p-3 text-sm text-sky-800">{message}</p>}
        <button disabled={saving} className="w-full rounded-xl bg-sky-600 py-4 font-bold text-white disabled:opacity-60">{saving?'Registering...':'Register patient'}</button>
      </form>
      <div className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
        <div className="flex items-center gap-3 border-b p-6"><Users className="text-sky-600"/><h2 className="font-bold">Recent registrations ({registrations.length})</h2></div>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-gray-50"><tr><th className="p-4">Patient</th><th className="p-4">Patient ID</th><th className="p-4">Department</th><th className="p-4">Token</th><th className="p-4">Fee</th></tr></thead><tbody>{registrations.map(row=><tr key={row.id} className="border-t"><td className="p-4 font-bold">{row.name}<div className="font-normal text-gray-500">{row.phoneNo}</div></td><td className="p-4">{row.patientId || '—'}</td><td className="p-4">{row.departmentName || '—'}</td><td className="p-4 font-bold text-sky-700">{row.tokenNumber || '—'}</td><td className="p-4">{row.isFreeCamp?'Free':`₹${row.fee}`}</td></tr>)}</tbody></table></div>
      </div>
    </div>
  </div>;
};

export default CounterDashboard;
