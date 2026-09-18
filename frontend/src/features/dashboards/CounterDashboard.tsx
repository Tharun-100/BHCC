import React from 'react';
import Link from 'next/link';
import { FreeCamp, LabRegistration, PatientLookupResult, User } from '../../types';
import { PlusCircle, Printer, Search, Users } from 'lucide-react';
import { createRegistration, listFreeCamps, listRegistrations, lookupPatientsByPhone, recordReceiptPrint } from '../../services/clinicService';

const emptyForm = { name: '', phoneNo: '', address: '', departmentId: '', campId: '', existingPatientId: '', createSeparatePatient: false, isFreeCamp: true };
const escapeReceiptValue = (value: unknown) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] || character);

const CounterDashboard: React.FC<{ user: User }> = () => {
  const [registrations, setRegistrations] = React.useState<LabRegistration[]>([]);
  const [camps, setCamps] = React.useState<FreeCamp[]>([]);
  const [matches, setMatches] = React.useState<PatientLookupResult[]>([]);
  const [form, setForm] = React.useState(emptyForm);
  const [receipt, setReceipt] = React.useState<LabRegistration | null>(null);
  const [message, setMessage] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  const load = () => Promise.all([listRegistrations(), listFreeCamps()]).then(([rows, campRows]) => {
    setRegistrations(rows);
    setCamps(campRows.filter((camp) => camp.isActive && camp.status === 'OPEN'));
  });
  React.useEffect(() => { load().catch(() => setMessage('Unable to load counter registration data.')); }, []);

  const camp = camps.find((row) => row.id === form.campId);
  const lookup = async () => {
    setMessage(''); setMatches([]);
    if (form.phoneNo.length !== 10) return;
    try {
      const rows = await lookupPatientsByPhone(form.phoneNo);
      setMatches(rows);
      if (rows.length === 1 && rows[0].name.trim().toLowerCase() === form.name.trim().toLowerCase()) setForm((current) => ({ ...current, existingPatientId: rows[0].userId }));
    } catch (error: any) { setMessage(error?.message || 'Patient lookup failed.'); }
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setMessage('');
    try {
      const row = await createRegistration(form);
      setRegistrations((previous) => [row, ...previous]); setReceipt(row); setForm(emptyForm); setMatches([]);
      setMessage(`Registered successfully with patient ID ${row.patientId}.`);
    } catch (error: any) { setMessage(error?.message || 'Registration failed.'); }
    finally { setSaving(false); }
  };
  const printReceipt = () => {
    if (!receipt) return;
    const printWindow = window.open('', '_blank', 'width=420,height=600');
    if (!printWindow) { setMessage('Allow pop-ups for this website to print the receipt.'); return; }
    const rows = [
      ['Patient Name :', receipt.name],
      ['Mobile :', receipt.phoneNo],
      ['Patient ID :', receipt.patientId],
      ['Department :', receipt.departmentName],
      ['Department Token :', receipt.tokenNumber],
    ];
    printWindow.document.write(`<!doctype html><html><head><meta charset="UTF-8"><title>Camp receipt</title><style>
      *{box-sizing:border-box}html,body{margin:0;width:80mm;background:#eee;color:#000}
      body{padding:20px;font-family:"Courier New",Courier,monospace;font-size:13px;font-weight:700}
      .receipt{width:80mm;margin:0;padding:4mm 3mm;background:#fff}
      .hospital-name{text-align:center;font-size:16px;line-height:18px;margin-bottom:5px}
      .camp-name{text-align:center;font-size:14px;line-height:17px;margin-bottom:8px}
      .line{border-top:1px dashed #000;margin:7px 0}
      .field{display:flex;width:100%;line-height:20px}.label{flex:0 0 46%;text-align:left;white-space:nowrap}
      .value{flex:1;min-width:0;text-align:right;overflow-wrap:anywhere}.token{margin-top:3px}
      .footer{margin-top:8px;text-align:center;font-size:13px}
      @media print{html,body{width:80mm;margin:0;padding:0;background:#fff}.receipt{width:80mm;margin:0;padding:4mm 3mm}}
    </style></head><body><section class="receipt"><div class="hospital-name">BHAKTIVEDANTA<br>HEALTH CARE CENTER</div><div class="camp-name">${escapeReceiptValue(receipt.campName)}</div><div class="line"></div>${rows.map(([label, value], index) => `<div class="field${index === rows.length - 1 ? ' token' : ''}"><div class="label">${label}</div><div class="value">${escapeReceiptValue(value)}</div></div>`).join('')}<div class="line"></div><div class="footer">Hare Krishna!</div></section></body></html>`);
    printWindow.document.close();
    printWindow.addEventListener('afterprint', () => printWindow.close(), { once: true });
    window.setTimeout(() => {
      const receiptElement = printWindow.document.querySelector('.receipt') as HTMLElement | null;
      const contentHeightMm = Math.max(45, Math.ceil((receiptElement?.scrollHeight || 0) * 25.4 / 96) + 1);
      const pageStyle = printWindow.document.createElement('style');
      pageStyle.textContent = `@page{size:80mm ${contentHeightMm}mm;margin:0}`;
      printWindow.document.head.appendChild(pageStyle);
      printWindow.focus();
      printWindow.print();
    }, 250);
    void recordReceiptPrint(receipt.id).catch(() => setMessage('Receipt opened, but its print audit could not be recorded.'));
  };

  return <><div className="no-print mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
    <div className="mb-8 flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-3xl font-extrabold">Camp Patient Registration</h1><p className="text-gray-500">Select an admin-created camp and department.</p></div><Link href="/dashboard/payroll" className="rounded-xl bg-sky-50 px-4 py-3 font-bold text-sky-700">My Payroll</Link></div>
    <div className="grid gap-8 lg:grid-cols-[430px_1fr]">
      <form onSubmit={submit} className="space-y-4 rounded-3xl border bg-white p-7">
        <h2 className="flex items-center text-xl font-bold"><PlusCircle className="mr-2 text-sky-600" />Register patient</h2>
        <select required value={form.campId} onChange={(event) => setForm({ ...form, campId: event.target.value, departmentId: '' })} className="w-full rounded-xl border p-3"><option value="">Select open camp</option>{camps.map((row) => <option key={row.id} value={row.id}>{row.name} — {row.date}</option>)}</select>
        <input required placeholder="Patient name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value, existingPatientId: '', createSeparatePatient: false })} className="w-full rounded-xl border p-3" />
        <div className="flex gap-2"><input required inputMode="numeric" pattern="[0-9]{10}" placeholder="10-digit mobile number" value={form.phoneNo} onChange={(event) => setForm({ ...form, phoneNo: event.target.value.replace(/\D/g, '').slice(0, 10), existingPatientId: '', createSeparatePatient: false })} onBlur={lookup} className="min-w-0 flex-1 rounded-xl border p-3" /><button type="button" onClick={lookup} className="rounded-xl border px-3" aria-label="Find existing patient"><Search /></button></div>
        {matches.length > 0 && <fieldset className="rounded-xl border border-amber-200 bg-amber-50 p-3"><legend className="font-bold">Confirm patient identity</legend>{matches.map((row) => <label key={row.userId} className="mt-2 flex gap-2"><input required type="radio" name="existingPatient" checked={form.existingPatientId === row.userId && !form.createSeparatePatient} onChange={() => setForm({ ...form, existingPatientId: row.userId, createSeparatePatient: false, name: row.name, address: row.address || form.address })} /><span>{row.name} — {row.patientId}</span></label>)}<label className="mt-2 flex gap-2"><input required type="radio" name="existingPatient" checked={form.createSeparatePatient} onChange={() => setForm({ ...form, existingPatientId: '', createSeparatePatient: true })} /><span>Different patient sharing this mobile number — create a new BHCC ID</span></label></fieldset>}
        <textarea required placeholder="Patient address" value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} className="w-full rounded-xl border p-3" />
        <select required value={form.departmentId} onChange={(event) => setForm({ ...form, departmentId: event.target.value })} disabled={!camp} className="w-full rounded-xl border p-3 disabled:bg-gray-100"><option value="">Select department</option>{(camp?.departments || []).map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select>
        {message && <p className="rounded-xl bg-sky-50 p-3 text-sm text-sky-800">{message}</p>}
        <button disabled={saving || !form.departmentId} className="w-full rounded-xl bg-sky-600 py-4 font-bold text-white disabled:opacity-60">{saving ? 'Registering...' : 'Register and prepare receipt'}</button>
      </form>
      <div className="overflow-hidden rounded-3xl border bg-white"><div className="flex items-center gap-3 border-b p-6"><Users className="text-sky-600" /><h2 className="font-bold">Recent camp registrations</h2></div><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-gray-50"><tr><th className="p-4">Patient</th><th className="p-4">ID</th><th className="p-4">Department</th><th className="p-4">Token</th><th className="p-4"></th></tr></thead><tbody>{registrations.filter((row) => row.isFreeCamp).map((row) => <tr key={row.id} className="border-t"><td className="p-4 font-bold">{row.name}<small className="block font-normal">{row.phoneNo}</small></td><td className="p-4">{row.patientId}</td><td className="p-4">{row.departmentName}</td><td className="p-4 font-bold text-sky-700">{row.tokenNumber}</td><td className="p-4"><button onClick={() => setReceipt(row)} className="font-bold text-sky-700">Receipt</button></td></tr>)}</tbody></table></div></div>
    </div>
    {receipt && <div className="mt-6 rounded-3xl border bg-white p-6"><h2 className="text-xl font-bold">Receipt ready</h2><p>{receipt.name} · {receipt.departmentName}</p><button onClick={printReceipt} className="mt-4 flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 font-bold text-white"><Printer />Print 3-inch receipt</button></div>}
  </div>
  </>;
};

export default CounterDashboard;
