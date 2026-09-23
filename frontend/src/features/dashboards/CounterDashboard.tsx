import React from 'react';
import Link from 'next/link';
import { Department, FreeCamp, LabRegistration, PatientLookupResult, User } from '../../types';
import { PlusCircle, Printer, Search, Users } from 'lucide-react';
import { createRegistration, listDepartments, listFreeCamps, listRegistrations, lookupPatientsByPhone, recordReceiptPrint } from '../../services/clinicService';
import RegistrationEditor from '../../components/RegistrationEditor';

const emptyForm = { name: '', phoneNo: '', address: '', age: '', gender: '', nativePlace: '', departmentId: '', campId: '', existingPatientId: '', createSeparatePatient: false, isFreeCamp: true };
const escapeReceiptValue = (value: unknown) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] || character);
const Required = ({ children }: { children: React.ReactNode }) => <>{children} <span className="text-red-600">*</span></>;

const CounterDashboard: React.FC<{ user: User }> = () => {
  const [registrations, setRegistrations] = React.useState<LabRegistration[]>([]);
  const [camps, setCamps] = React.useState<FreeCamp[]>([]);
  const [departments, setDepartments] = React.useState<Department[]>([]);
  const [matches, setMatches] = React.useState<PatientLookupResult[]>([]);
  const [form, setForm] = React.useState(emptyForm);
  const [receipt, setReceipt] = React.useState<LabRegistration | null>(null);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  const load = () => Promise.all([listRegistrations(), listFreeCamps(), listDepartments()]).then(([rows, campRows, departmentRows]) => {
    setRegistrations(rows); setCamps(campRows.filter((camp) => camp.isActive && camp.status === 'OPEN')); setDepartments(departmentRows);
  });
  React.useEffect(() => { load().catch(() => setMessage('Unable to load counter registration data.')); }, []);
  const camp = camps.find((row) => row.id === form.campId);
  const availableDepartments = form.isFreeCamp ? (camp?.departments || []) : departments;

  const lookup = async () => {
    setMessage(''); setMatches([]);
    if (form.phoneNo.length !== 10) return;
    try {
      const rows = await lookupPatientsByPhone(form.phoneNo, form.name);
      setMatches(rows);
      const exact = rows.find((row) => row.exactMatch);
      if (exact) {
        setForm((current) => ({ ...current, existingPatientId: exact.userId, createSeparatePatient: false, name: exact.name, address: exact.address, age: exact.age == null ? '' : String(exact.age), gender: exact.gender, nativePlace: exact.nativePlace || '' }));
        setMessage(`Existing patient found: ${exact.patientId}. Details were filled automatically.`);
      } else if (rows.length) setMessage('This mobile number exists, but the name does not match. Select the correct patient or create a separate patient.');
      else setMessage('No existing patient found. A new BHCC patient ID will be created.');
    } catch (error: any) { setMessage(error?.message || 'Patient lookup failed.'); }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setMessage('');
    try {
      const row = await createRegistration(form);
      setRegistrations((previous) => [row, ...previous]); setReceipt(row.isFreeCamp ? row : null); setForm(emptyForm); setMatches([]);
      setMessage(`Registered successfully with patient ID ${row.patientId}.`);
    } catch (error: any) { setMessage(error?.message || 'Registration failed.'); }
    finally { setSaving(false); }
  };

  const printReceipt = () => {
    if (!receipt) return;
    const printWindow = window.open('', '_blank', 'width=420,height=600');
    if (!printWindow) { setMessage('Allow pop-ups for this website to print the receipt.'); return; }
    const rows = [['Patient Name :', receipt.name], ['Mobile :', receipt.phoneNo], ['Patient ID :', receipt.patientId], ['Department :', receipt.departmentName], ['Department Token :', receipt.tokenNumber]];
    printWindow.document.write(`<!doctype html><html><head><meta charset="UTF-8"><title>Camp receipt</title><style>
      *{box-sizing:border-box;font-weight:900!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}html,body{margin:0;width:80mm;background:#eee;color:#000}
      body{padding:20px;font-family:"Courier New",Courier,monospace;font-size:13px;font-weight:900;-webkit-text-stroke:.18px #000}.receipt{width:80mm;margin:0;padding:4mm 3mm;background:#fff}
      .hospital-name{text-align:center;font-size:16px;line-height:18px;margin-bottom:5px}.camp-name{text-align:center;font-size:14px;line-height:17px;margin-bottom:8px}.line{border-top:1px dashed #000;margin:7px 0}
      .field{display:flex;width:100%;line-height:20px}.label{flex:0 0 46%;text-align:left;white-space:nowrap}.value{flex:1;min-width:0;text-align:right;overflow-wrap:anywhere}.token{margin-top:3px}.footer{margin-top:8px;text-align:center;font-size:13px}
      @media print{html,body{width:80mm;margin:0;padding:0;background:#fff}.receipt{width:80mm;margin:0;padding:4mm 3mm}}
    </style></head><body><section class="receipt"><div class="hospital-name">BHAKTIVEDANTA<br>HEALTH CARE CENTER</div><div class="camp-name">${escapeReceiptValue(receipt.campName)}</div><div class="line"></div>${rows.map(([label, value], index) => `<div class="field${index === rows.length - 1 ? ' token' : ''}"><div class="label">${label}</div><div class="value">${escapeReceiptValue(value)}</div></div>`).join('')}<div class="line"></div><div class="footer">Hare Krishna!</div></section></body></html>`);
    printWindow.document.close(); printWindow.addEventListener('afterprint', () => printWindow.close(), { once: true });
    window.setTimeout(() => { const element = printWindow.document.querySelector('.receipt') as HTMLElement | null; const height = Math.max(45, Math.ceil((element?.scrollHeight || 0) * 25.4 / 96) + 1); const style = printWindow.document.createElement('style'); style.textContent = `@page{size:80mm ${height}mm;margin:0}`; printWindow.document.head.appendChild(style); printWindow.focus(); printWindow.print(); }, 250);
    void recordReceiptPrint(receipt.id).catch(() => setMessage('Receipt opened, but its print audit could not be recorded.'));
  };

  return <><div className="no-print mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
    <div className="mb-8 flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-3xl font-extrabold">Patient Registration</h1><p className="text-gray-500">Register free-camp and general ₹150 service patients.</p></div><Link href="/dashboard/payroll" className="rounded-xl bg-sky-50 px-4 py-3 font-bold text-sky-700">My Payroll</Link></div>
    <div className="grid gap-8 lg:grid-cols-[430px_1fr]">
      <form onSubmit={submit} className="space-y-4 rounded-3xl border bg-white p-7">
        <h2 className="flex items-center text-xl font-bold"><PlusCircle className="mr-2 text-sky-600" />Register patient</h2>
        <div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => { setForm({ ...emptyForm, isFreeCamp: true }); setMatches([]); }} className={`rounded-xl border p-3 font-bold ${form.isFreeCamp ? 'bg-sky-600 text-white' : 'bg-white'}`}>Free camp</button><button type="button" onClick={() => { setForm({ ...emptyForm, isFreeCamp: false }); setMatches([]); }} className={`rounded-xl border p-3 font-bold ${!form.isFreeCamp ? 'bg-sky-600 text-white' : 'bg-white'}`}>General ₹150</button></div>
        {form.isFreeCamp && <label className="block text-sm font-bold"><Required>Camp</Required><select required value={form.campId} onChange={(event) => setForm({ ...form, campId: event.target.value, departmentId: '' })} className="mt-1 w-full rounded-xl border p-3"><option value="">Select open camp</option>{camps.map((row) => <option key={row.id} value={row.id}>{row.name} — {row.date}</option>)}</select></label>}
        <label className="block text-sm font-bold"><Required>Name</Required><input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value, existingPatientId: '', createSeparatePatient: false })} className="mt-1 w-full rounded-xl border p-3" /></label>
        <label className="block text-sm font-bold"><Required>Mobile number</Required><div className="mt-1 flex gap-2"><input required inputMode="numeric" pattern="[0-9]{10}" value={form.phoneNo} onChange={(event) => setForm({ ...form, phoneNo: event.target.value.replace(/\D/g, '').slice(0, 10), existingPatientId: '', createSeparatePatient: false })} onBlur={lookup} className="min-w-0 flex-1 rounded-xl border p-3" /><button type="button" onClick={lookup} className="rounded-xl border px-3" aria-label="Check existing patient"><Search /></button></div></label>
        {matches.length > 0 && <fieldset className="rounded-xl border border-amber-200 bg-amber-50 p-3"><legend className="font-bold">Patient exists — confirm identity</legend>{matches.map((row) => <label key={row.userId} className="mt-2 flex gap-2"><input required type="radio" name="existingPatient" checked={form.existingPatientId === row.userId && !form.createSeparatePatient} onChange={() => setForm({ ...form, existingPatientId: row.userId, createSeparatePatient: false, name: row.name, address: row.address, age: row.age == null ? '' : String(row.age), gender: row.gender, nativePlace: row.nativePlace || '' })} /><span>{row.name} — {row.patientId}{row.exactMatch ? ' (exact match)' : ''}</span></label>)}<label className="mt-2 flex gap-2"><input required type="radio" name="existingPatient" checked={form.createSeparatePatient} onChange={() => setForm({ ...form, existingPatientId: '', createSeparatePatient: true })} /><span>Different patient sharing this mobile number — create a new BHCC ID</span></label></fieldset>}
        <label className="block text-sm font-bold"><Required>Address</Required><textarea required value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} className="mt-1 w-full rounded-xl border p-3" /></label>
        <div className="grid grid-cols-2 gap-3"><label className="text-sm font-bold"><Required>Age</Required><input required type="number" min="0" max="120" value={form.age} onChange={(event) => setForm({ ...form, age: event.target.value })} className="mt-1 w-full rounded-xl border p-3" /></label><label className="text-sm font-bold"><Required>Gender</Required><select required value={form.gender} onChange={(event) => setForm({ ...form, gender: event.target.value })} className="mt-1 w-full rounded-xl border p-3"><option value="">Select</option><option value="MALE">Male</option><option value="FEMALE">Female</option><option value="OTHER">Other</option></select></label></div>
        <label className="block text-sm font-bold">Native place <span className="font-normal text-gray-500">(optional)</span><input value={form.nativePlace} onChange={(event) => setForm({ ...form, nativePlace: event.target.value })} className="mt-1 w-full rounded-xl border p-3" /></label>
        <label className="block text-sm font-bold"><Required>Department</Required><select required value={form.departmentId} onChange={(event) => setForm({ ...form, departmentId: event.target.value })} disabled={form.isFreeCamp && !camp} className="mt-1 w-full rounded-xl border p-3 disabled:bg-gray-100"><option value="">Select department</option>{availableDepartments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
        {message && <p className="rounded-xl bg-sky-50 p-3 text-sm text-sky-800">{message}</p>}
        <button disabled={saving || !form.departmentId} className="w-full rounded-xl bg-sky-600 py-4 font-bold text-white disabled:opacity-60">{saving ? 'Registering...' : 'Register patient'}</button>
      </form>
      <div className="overflow-hidden rounded-3xl border bg-white"><div className="flex items-center gap-3 border-b p-6"><Users className="text-sky-600" /><h2 className="font-bold">Recent registrations</h2></div><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-gray-50"><tr><th className="p-4">Patient</th><th className="p-4">Type</th><th className="p-4">Department</th><th className="p-4">Token</th><th className="p-4"></th></tr></thead><tbody>{registrations.map((row) => <React.Fragment key={row.id}><tr className="border-t"><td className="p-4 font-bold">{row.name}<small className="block font-normal">{row.phoneNo} · Age {row.age} · {row.gender}</small><small className="block font-normal">{row.patientId}</small></td><td className="p-4">{row.isFreeCamp ? 'Free camp' : 'General ₹150'}</td><td className="p-4">{row.departmentName}</td><td className="p-4 font-bold text-sky-700">{row.tokenNumber}</td><td className="p-4"><div className="flex gap-3"><button onClick={() => setEditingId(row.id)} className="font-bold text-sky-700">Edit</button>{row.isFreeCamp && <button onClick={() => setReceipt(row)} className="font-bold text-sky-700">Receipt</button>}</div></td></tr>{editingId === row.id && <tr><td colSpan={5} className="p-3"><RegistrationEditor registration={row} departments={row.isFreeCamp ? (camps.find((item) => item.id === row.campId)?.departments || departments) : departments} onCancel={() => setEditingId(null)} onSaved={(updated) => { setRegistrations((current) => current.map((item) => item.id === updated.id ? updated : item)); setEditingId(null); setMessage('Patient details updated successfully.'); }} /></td></tr>}</React.Fragment>)}</tbody></table></div></div>
    </div>
    {receipt && <div className="mt-6 rounded-3xl border bg-white p-6"><h2 className="text-xl font-bold">Receipt ready</h2><p>{receipt.name} · {receipt.departmentName}</p><button onClick={printReceipt} className="mt-4 flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 font-bold text-white"><Printer />Print 3-inch receipt</button></div>}
  </div></>;
};

export default CounterDashboard;
