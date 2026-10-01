import React from 'react';
import Link from 'next/link';
import { Appointment, Department, FreeCamp, LabRegistration, PatientLookupResult, User } from '../../types';
import { PlusCircle, Printer, Search, Users } from 'lucide-react';
import { checkPaytmPosPayment, createCounterAppointment, createRegistration, getDoctorAvailability, initiatePaytmPosPayment, listAllAppointments, listDepartments, listDoctors, listFreeCamps, listRegistrations, lookupPatientsByPhone, recordCashPayment, recordManualPosPayment, recordReceiptPrint, searchExistingPatients } from '../../services/clinicService';
import RegistrationEditor from '../../components/RegistrationEditor';

const emptyForm = { name: '', phoneNo: '', address: '', age: '', gender: '', nativePlace: '', departmentId: '', campId: '', doctorId: '', time: '', existingPatientId: '', createSeparatePatient: false, isFreeCamp: true };
const escapeReceiptValue = (value: unknown) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] || character);
const Required = ({ children }: { children: React.ReactNode }) => <>{children} <span className="text-red-600">*</span></>;
const clinicDate = (value: Date) => { const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value); const part = (type: string) => parts.find((item) => item.type === type)?.value || ''; return `${part('year')}-${part('month')}-${part('day')}`; };

const CounterDashboard: React.FC<{ user: User }> = () => {
  const [registrations, setRegistrations] = React.useState<LabRegistration[]>([]);
  const [camps, setCamps] = React.useState<FreeCamp[]>([]);
  const [departments, setDepartments] = React.useState<Department[]>([]);
  const [appointments, setAppointments] = React.useState<Appointment[]>([]);
  const [doctors, setDoctors] = React.useState<User[]>([]);
  const [booking, setBooking] = React.useState({patientId:'', doctorId:'', date:'', time:''});
  const [bookingDepartment, setBookingDepartment] = React.useState('');
  const [bookingPaymentMethod, setBookingPaymentMethod] = React.useState<'CASH' | 'PAYTM_POS'>('CASH');
  const [bookingBusy, setBookingBusy] = React.useState(false);
  const [patientSearch, setPatientSearch] = React.useState('');
  const [patientResults, setPatientResults] = React.useState<PatientLookupResult[]>([]);
  const [slots, setSlots] = React.useState<string[]>([]);
  const [campSlots, setCampSlots] = React.useState<string[]>([]);
  const [matches, setMatches] = React.useState<PatientLookupResult[]>([]);
  const [form, setForm] = React.useState(emptyForm);
  const [receipt, setReceipt] = React.useState<LabRegistration | null>(null);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const today = clinicDate(new Date());
  const todayRegistrations = registrations.filter((row) => clinicDate(new Date(row.createdAt)) === today);
  const todayAppointments = appointments.filter((row) => row.date === today && row.status !== 'Cancelled');

  const load = () => Promise.all([listRegistrations(), listFreeCamps(), listDepartments(), listAllAppointments(), listDoctors()]).then(([rows, campRows, departmentRows, appointmentRows, doctorRows]) => {
    setRegistrations(rows); setCamps(campRows.filter((camp) => camp.isActive && camp.status === 'OPEN')); setDepartments(departmentRows); setAppointments(appointmentRows); setDoctors(doctorRows);
  });
  React.useEffect(() => { load().catch(() => setMessage('Unable to load counter registration data.')); }, []);
  const camp = camps.find((row) => row.id === form.campId);
  const availableDepartments = form.isFreeCamp ? (camp?.departments || []) : departments;
  const campDoctors = doctors.filter((doctor) => doctor.department === availableDepartments.find((department) => department.id === form.departmentId)?.name);
  React.useEffect(() => { if (form.isFreeCamp && form.doctorId && camp?.date) getDoctorAvailability(form.doctorId, camp.date).then(setCampSlots).catch(() => setCampSlots([])); else setCampSlots([]); }, [form.isFreeCamp, form.doctorId, camp?.date]);

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

  const recordPosPayment = async (appointment: Appointment) => {
    const reference = window.prompt(`Enter the Paytm POS receipt/reference for ${appointment.patientName}.\nAmount: ₹${appointment.fee}`, appointment.paymentReference || '');
    if (reference === null) return;
    if (reference.trim().length < 4) { setMessage('Enter a valid Paytm POS receipt/reference.'); return; }
    try {
      const updated = await recordManualPosPayment(appointment.id, reference.trim());
      setAppointments((current) => current.map((row) => row.id === updated.id ? updated : row));
      setMessage(`Payment recorded for ${updated.patientName}. Reference: ${updated.paymentReference}`);
    } catch (error: any) { setMessage(error?.message || 'Could not record the POS payment.'); }
  };

  const recordCash = async (appointment: Appointment) => {
    if (!window.confirm(`Confirm cash received from ${appointment.patientName}.\nAmount: ₹${appointment.fee.toLocaleString('en-IN')}`)) return;
    try {
      const updated = await recordCashPayment(appointment.id);
      setAppointments((current) => current.map((row) => row.id === updated.id ? updated : row));
      setMessage(`Cash payment recorded for ${updated.patientName}.`);
    } catch (error: any) { setMessage(error?.message || 'Could not record the cash payment.'); }
  };

  const runAutomaticPos = async (appointment: Appointment, checkOnly = false) => {
    try {
      const updated = checkOnly ? await checkPaytmPosPayment(appointment.id) : await initiatePaytmPosPayment(appointment.id);
      setAppointments((current) => current.map((row) => row.id === updated.id ? updated : row));
      setMessage(checkOnly ? `Paytm status: ${updated.paymentStatus}` : 'Payment sent to the Paytm POS. Complete it on the machine, then check status.');
    } catch (error: any) { setMessage(error?.message || 'Paytm POS request failed. Manual receipt entry remains available.'); }
  };

  React.useEffect(() => { if (!booking.doctorId || !booking.date) { setSlots([]); return; } let active=true; const refresh=()=>getDoctorAvailability(booking.doctorId,booking.date).then((rows)=>{if(active){setSlots(rows);setBooking((current)=>current.time&&!rows.includes(current.time)?{...current,time:''}:current);}}).catch(()=>null); void refresh(); const timer=window.setInterval(refresh,5000); return()=>{active=false;window.clearInterval(timer);}; }, [booking.doctorId, booking.date]);
  React.useEffect(() => { const query=patientSearch.trim(); if(query.length<2){setPatientResults([]);return;} const timer=window.setTimeout(()=>searchExistingPatients(query).then(setPatientResults).catch(()=>setPatientResults([])),300); return()=>window.clearTimeout(timer); }, [patientSearch]);
  const selectedBookingPatient = patientResults.find((row)=>row.userId===booking.patientId) || registrations.find((row)=>row.patientUserId===booking.patientId);
  const selectedBookingDoctor = doctors.find((row)=>row.id===booking.doctorId);
  const bookingDoctors = doctors.filter((row)=>!bookingDepartment||row.department===bookingDepartment);
  const bookConsultation = async (event: React.FormEvent) => {
    event.preventDefault(); setMessage(''); setBookingBusy(true);
    let appointmentId = '';
    try {
      appointmentId = await createCounterAppointment(booking);
    } catch(error:any) {
      if(booking.doctorId&&booking.date)getDoctorAvailability(booking.doctorId,booking.date).then(setSlots).catch(()=>null);
      setMessage(error?.message || 'Could not book consultation.'); setBookingBusy(false); return;
    }
    try {
      if (bookingPaymentMethod === 'CASH') {
        await recordCashPayment(appointmentId);
        setMessage('Appointment booked and cash payment recorded successfully.');
      } else {
        await initiatePaytmPosPayment(appointmentId);
        setMessage('Appointment booked and payment sent to the Paytm POS. Complete it on the machine, then check its status below.');
      }
    } catch(error:any) {
      setMessage(`Appointment was booked, but payment could not be completed: ${error?.message || 'POS request failed'}. Use the payment actions below; do not book the slot again.`);
    }
    setBooking({patientId:'',doctorId:'',date:'',time:''}); setBookingDepartment(''); setPatientSearch(''); setPatientResults([]); await load(); setBookingBusy(false);
  };

  return <><div className="no-print mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
    <div className="mb-8 flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-3xl font-extrabold">Patient Registration</h1><p className="text-gray-500">Register clinic patients or free-camp patients. Registration itself has no charge.</p></div><Link href="/dashboard/payroll" className="rounded-xl bg-sky-50 px-4 py-3 font-bold text-sky-700">My Payroll</Link></div>
    <div className="grid gap-8 lg:grid-cols-[430px_1fr]">
      <form onSubmit={submit} className="space-y-4 rounded-3xl border bg-white p-7">
        <h2 className="flex items-center text-xl font-bold"><PlusCircle className="mr-2 text-sky-600" />Register patient</h2>
        <div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => { setForm({ ...emptyForm, isFreeCamp: true }); setMatches([]); }} className={`rounded-xl border p-3 font-bold ${form.isFreeCamp ? 'bg-sky-600 text-white' : 'bg-white'}`}>Free camp</button><button type="button" onClick={() => { setForm({ ...emptyForm, isFreeCamp: false }); setMatches([]); }} className={`rounded-xl border p-3 font-bold ${!form.isFreeCamp ? 'bg-sky-600 text-white' : 'bg-white'}`}>Clinic patient</button></div>
        {form.isFreeCamp && <label className="block text-sm font-bold"><Required>Camp</Required><select required value={form.campId} onChange={(event) => setForm({ ...form, campId: event.target.value, departmentId: '' })} className="mt-1 w-full rounded-xl border p-3"><option value="">Select open camp</option>{camps.map((row) => <option key={row.id} value={row.id}>{row.name} — {row.date}</option>)}</select></label>}
        <label className="block text-sm font-bold"><Required>Name</Required><input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value, existingPatientId: '', createSeparatePatient: false })} className="mt-1 w-full rounded-xl border p-3" /></label>
        <label className="block text-sm font-bold"><Required>Mobile number</Required><div className="mt-1 flex gap-2"><input required inputMode="numeric" pattern="[0-9]{10}" value={form.phoneNo} onChange={(event) => setForm({ ...form, phoneNo: event.target.value.replace(/\D/g, '').slice(0, 10), existingPatientId: '', createSeparatePatient: false })} onBlur={lookup} className="min-w-0 flex-1 rounded-xl border p-3" /><button type="button" onClick={lookup} className="rounded-xl border px-3" aria-label="Check existing patient"><Search /></button></div></label>
        {matches.length > 0 && <fieldset className="rounded-xl border border-amber-200 bg-amber-50 p-3"><legend className="font-bold">Patient exists — confirm identity</legend>{matches.map((row) => <label key={row.userId} className="mt-2 flex gap-2"><input required type="radio" name="existingPatient" checked={form.existingPatientId === row.userId && !form.createSeparatePatient} onChange={() => setForm({ ...form, existingPatientId: row.userId, createSeparatePatient: false, name: row.name, address: row.address, age: row.age == null ? '' : String(row.age), gender: row.gender, nativePlace: row.nativePlace || '' })} /><span>{row.name} — {row.patientId}{row.exactMatch ? ' (exact match)' : ''}</span></label>)}<label className="mt-2 flex gap-2"><input required type="radio" name="existingPatient" checked={form.createSeparatePatient} onChange={() => setForm({ ...form, existingPatientId: '', createSeparatePatient: true })} /><span>Different patient sharing this mobile number — create a new BHCC ID</span></label></fieldset>}
        <label className="block text-sm font-bold"><Required>Address</Required><textarea required value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} className="mt-1 w-full rounded-xl border p-3" /></label>
        <div className="grid grid-cols-2 gap-3"><label className="text-sm font-bold"><Required>Age</Required><input required type="number" min="0" max="120" value={form.age} onChange={(event) => setForm({ ...form, age: event.target.value })} className="mt-1 w-full rounded-xl border p-3" /></label><label className="text-sm font-bold"><Required>Gender</Required><select required value={form.gender} onChange={(event) => setForm({ ...form, gender: event.target.value })} className="mt-1 w-full rounded-xl border p-3"><option value="">Select</option><option value="MALE">Male</option><option value="FEMALE">Female</option><option value="OTHER">Other</option></select></label></div>
        <label className="block text-sm font-bold">Native place <span className="font-normal text-gray-500">(optional)</span><input value={form.nativePlace} onChange={(event) => setForm({ ...form, nativePlace: event.target.value })} className="mt-1 w-full rounded-xl border p-3" /></label>
        <label className="block text-sm font-bold"><Required>Department</Required><select required value={form.departmentId} onChange={(event) => setForm({ ...form, departmentId: event.target.value, doctorId:'', time:'' })} disabled={form.isFreeCamp && !camp} className="mt-1 w-full rounded-xl border p-3 disabled:bg-gray-100"><option value="">Select department</option>{availableDepartments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
        {form.isFreeCamp && <><label className="block text-sm font-bold"><Required>Doctor</Required><select required value={form.doctorId} onChange={(event)=>setForm({...form,doctorId:event.target.value,time:''})} className="mt-1 w-full rounded-xl border p-3"><option value="">Select camp doctor</option>{campDoctors.map(doctor=><option key={doctor.id} value={doctor.id}>{doctor.name}</option>)}</select></label><label className="block text-sm font-bold"><Required>Appointment time</Required><select required value={form.time} onChange={(event)=>setForm({...form,time:event.target.value})} className="mt-1 w-full rounded-xl border p-3"><option value="">Select available slot</option>{campSlots.map(slot=><option key={slot}>{slot}</option>)}</select></label></>}
        {message && <p className="rounded-xl bg-sky-50 p-3 text-sm text-sky-800">{message}</p>}
        <button disabled={saving || !form.departmentId} className="w-full rounded-xl bg-sky-600 py-4 font-bold text-white disabled:opacity-60">{saving ? 'Registering...' : 'Register patient'}</button>
      </form>
      <div className="overflow-hidden rounded-3xl border bg-white"><div className="flex items-center gap-3 border-b p-6"><Users className="text-sky-600" /><div><h2 className="font-bold">Today’s registrations</h2><p className="text-xs text-gray-500">This operational list starts empty each day. Historical records remain stored.</p></div></div><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-gray-50"><tr><th className="p-4">Patient</th><th className="p-4">Type</th><th className="p-4">Department</th><th className="p-4">Token</th><th className="p-4"></th></tr></thead><tbody>{todayRegistrations.map((row) => <React.Fragment key={row.id}><tr className="border-t"><td className="p-4 font-bold">{row.name}<small className="block font-normal">{row.phoneNo} · Age {row.age} · {row.gender}</small><small className="block font-normal">{row.patientId}</small></td><td className="p-4">{row.isFreeCamp ? 'Free camp' : 'Clinic patient'}</td><td className="p-4">{row.departmentName}</td><td className="p-4 font-bold text-sky-700">{row.tokenNumber}</td><td className="p-4"><div className="flex gap-3"><button onClick={() => setEditingId(row.id)} className="font-bold text-sky-700">Edit</button>{row.isFreeCamp && <button onClick={() => setReceipt(row)} className="font-bold text-sky-700">Receipt</button>}</div></td></tr>{editingId === row.id && <tr><td colSpan={5} className="p-3"><RegistrationEditor registration={row} departments={row.isFreeCamp ? (camps.find((item) => item.id === row.campId)?.departments || departments) : departments} onCancel={() => setEditingId(null)} onSaved={(updated) => { setRegistrations((current) => current.map((item) => item.id === updated.id ? updated : item)); setEditingId(null); setMessage('Patient details updated successfully.'); }} /></td></tr>}</React.Fragment>)}{todayRegistrations.length===0&&<tr><td colSpan={5} className="p-8 text-center text-gray-500">No patients registered today.</td></tr>}</tbody></table></div></div>
    </div>
    {receipt && <div className="mt-6 rounded-3xl border bg-white p-6"><h2 className="text-xl font-bold">Receipt ready</h2><p>{receipt.name} · {receipt.departmentName}</p><button onClick={printReceipt} className="mt-4 flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 font-bold text-white"><Printer />Print 3-inch receipt</button></div>}
    <section className="mt-8 overflow-hidden rounded-3xl border bg-white">
      <form onSubmit={bookConsultation} className="border-b bg-slate-50 p-6">
        <div className="mb-6"><h2 className="text-2xl font-black">Book doctor at counter</h2><p className="text-sm text-gray-500">Follow the same booking sequence as the patient portal, then collect Cash or Online / Paytm POS payment.</p></div>
        <div className="grid gap-5 lg:grid-cols-2">
          <section className="rounded-2xl border bg-white p-5"><p className="mb-3 text-xs font-black uppercase tracking-wider text-sky-700">1 · Department and doctor</p><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-bold">Department<select required value={bookingDepartment} onChange={(e)=>{setBookingDepartment(e.target.value);setBooking({...booking,doctorId:'',date:'',time:''});}} className="mt-1 w-full rounded-xl border p-3"><option value="">Select department</option>{departments.map(row=><option key={row.id} value={row.name}>{row.name}</option>)}</select></label><label className="text-sm font-bold">Doctor<select required value={booking.doctorId} onChange={(e)=>setBooking({...booking,doctorId:e.target.value,date:'',time:''})} disabled={!bookingDepartment} className="mt-1 w-full rounded-xl border p-3 disabled:bg-gray-100"><option value="">Select doctor</option>{bookingDoctors.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label></div>{selectedBookingDoctor&&<p className="mt-3 rounded-xl bg-sky-50 p-3 text-sm"><b>{selectedBookingDoctor.name}</b><span className="block text-gray-600">{selectedBookingDoctor.specialty || selectedBookingDoctor.department} · Consultation ₹{(selectedBookingDoctor.fee || 0).toLocaleString('en-IN')}</span></p>}</section>
          <section className="rounded-2xl border bg-white p-5"><p className="mb-3 text-xs font-black uppercase tracking-wider text-sky-700">2 · Date and live slot</p><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-bold">Date<input required type="date" min={new Date().toISOString().slice(0,10)} value={booking.date} onChange={(e)=>setBooking({...booking,date:e.target.value,time:''})} disabled={!booking.doctorId} className="mt-1 w-full rounded-xl border p-3 disabled:bg-gray-100"/></label><label className="text-sm font-bold">Available slot<select required value={booking.time} onChange={(e)=>setBooking({...booking,time:e.target.value})} disabled={!booking.date||slots.length===0} className="mt-1 w-full rounded-xl border p-3 disabled:bg-gray-100"><option value="">{booking.date?(slots.length?'Select available slot':'No slots available'):'Select date first'}</option>{slots.map(slot=><option key={slot}>{slot}</option>)}</select></label></div><p className="mt-2 text-xs text-gray-500">Slots refresh automatically. A booked slot disappears and a cancelled slot reopens.</p></section>
          <section className="rounded-2xl border bg-white p-5"><p className="mb-3 text-xs font-black uppercase tracking-wider text-sky-700">3 · Existing patient</p><div className="relative"><div className="flex items-center rounded-xl border bg-white px-3"><Search size={18} className="text-gray-400"/><input required value={patientSearch} onChange={(e)=>{setPatientSearch(e.target.value);setBooking({...booking,patientId:''});}} placeholder="Search name, mobile or BHCC ID" className="w-full p-3 outline-none"/></div>{patientResults.length>0&&!booking.patientId&&<div className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border bg-white shadow-xl">{patientResults.map((row)=><button type="button" key={row.userId} onClick={()=>{setBooking({...booking,patientId:row.userId});setPatientSearch(`${row.name} — ${row.patientId}`);}} className="block w-full border-b p-3 text-left hover:bg-sky-50"><b>{row.name}</b><small className="block text-gray-500">{row.patientId} · {row.phoneNo}</small></button>)}</div>}</div>{selectedBookingPatient&&booking.patientId?<p className="mt-3 rounded-xl bg-green-50 p-3 text-sm font-bold text-green-800">Selected: {selectedBookingPatient.name} · {selectedBookingPatient.patientId}</p>:<p className="mt-2 text-xs text-gray-500">Select a result before continuing.</p>}</section>
          <section className="rounded-2xl border bg-white p-5"><p className="mb-3 text-xs font-black uppercase tracking-wider text-sky-700">4 · Review and payment</p><div className="mb-4 grid grid-cols-2 gap-3 rounded-xl bg-gray-50 p-3 text-sm"><span className="text-gray-500">Patient</span><b className="text-right">{selectedBookingPatient?.name || '—'}</b><span className="text-gray-500">Doctor</span><b className="text-right">{selectedBookingDoctor?.name || '—'}</b><span className="text-gray-500">Date / time</span><b className="text-right">{booking.date&&booking.time?`${booking.date} · ${booking.time}`:'—'}</b><span className="text-gray-500">Amount</span><b className="text-right">₹{(selectedBookingDoctor?.fee || 0).toLocaleString('en-IN')}</b></div><div className="grid grid-cols-2 gap-3"><button type="button" onClick={()=>setBookingPaymentMethod('CASH')} className={`rounded-xl border p-3 font-bold ${bookingPaymentMethod==='CASH'?'border-emerald-600 bg-emerald-50 text-emerald-800':'bg-white'}`}>Cash</button><button type="button" onClick={()=>setBookingPaymentMethod('PAYTM_POS')} className={`rounded-xl border p-3 font-bold ${bookingPaymentMethod==='PAYTM_POS'?'border-sky-600 bg-sky-50 text-sky-800':'bg-white'}`}>Online / Paytm POS</button></div></section>
        </div>
        <button disabled={bookingBusy||!bookingDepartment||!booking.doctorId||!booking.date||!booking.time||!booking.patientId} className="mt-5 w-full rounded-xl bg-slate-900 p-4 text-lg font-black text-white disabled:opacity-50">{bookingBusy?'Booking and processing payment…':`Confirm booking and ${bookingPaymentMethod==='CASH'?'record cash':'send to Paytm POS'}`}</button>
      </form>
      <div className="border-b p-6"><h2 className="text-xl font-bold">Today’s consultation payments</h2><p className="text-sm text-gray-500">Daily department tokens reset from 001. Only today’s appointments appear here; historical payments remain stored.</p></div>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-gray-50"><tr><th className="p-4">Token</th><th className="p-4">Appointment</th><th className="p-4">Doctor</th><th className="p-4">Amount</th><th className="p-4">Payment</th><th className="p-4">Action</th></tr></thead><tbody>
        {todayAppointments.slice(0, 100).map((row) => <tr key={row.id} className="border-t"><td className="p-4 font-black text-sky-700">{row.tokenNumber || '—'}</td><td className="p-4"><b>{row.patientName}</b><small className="block">{row.date} · {row.time}</small></td><td className="p-4">{row.doctorName}<small className="block">{row.department}</small></td><td className="p-4 font-bold">₹{row.fee.toLocaleString('en-IN')}</td><td className="p-4">{row.paymentStatus || 'Pending'}{row.paymentMethod && <small className="block font-bold">{row.paymentMethod === 'CASH' ? 'Cash' : 'Online / Paytm'}</small>}{row.paymentReference && <small className="block font-mono">{row.paymentReference}</small>}</td><td className="p-4"><div className="flex flex-wrap gap-2">{row.paymentStatus === 'Confirmed' ? <span className="font-bold text-green-700">Payment recorded</span> : <><button type="button" onClick={() => recordCash(row)} className="rounded-lg bg-emerald-600 px-3 py-2 font-bold text-white">Cash</button>{row.paymentMethod === 'PAYTM_POS_AUTOMATIC' ? <button type="button" onClick={() => runAutomaticPos(row, true)} className="rounded-lg bg-amber-600 px-3 py-2 font-bold text-white">Check Paytm</button> : <button type="button" onClick={() => runAutomaticPos(row)} className="rounded-lg bg-sky-600 px-3 py-2 font-bold text-white">Online / Paytm</button>}<button type="button" onClick={() => recordPosPayment(row)} className="rounded-lg border px-3 py-2 font-bold">Enter Paytm receipt</button></>}</div></td></tr>)}
        {todayAppointments.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-gray-500">No appointments or payments for today.</td></tr>}
      </tbody></table></div>
    </section>
  </div></>;
};

export default CounterDashboard;
