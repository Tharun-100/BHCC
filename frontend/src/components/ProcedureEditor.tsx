import React from 'react';
import { Appointment, DentalProcedure } from '../types';
import { getAppointmentProcedures, listDentalProcedures, saveAppointmentProcedures } from '../services/clinicService';

export default function ProcedureEditor({appointment, onSaved}: {appointment: Appointment; onSaved: (value: Appointment) => void}) {
  const [open, setOpen] = React.useState(false);
  const [catalog, setCatalog] = React.useState<DentalProcedure[]>([]);
  const [items, setItems] = React.useState<Array<{procedureId:string;name:string;charge:number}>>([]);
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);
  const load = async () => {
    setOpen(true); setBusy(true); setLoaded(false); setError('');
    try {
      const [procedures, bill] = await Promise.all([listDentalProcedures(), getAppointmentProcedures(appointment.id)]);
      setCatalog(procedures.filter(row => row.isActive && row.department.toLowerCase() === appointment.department.toLowerCase()));
      setItems(bill.items);
      setLoaded(true);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not load procedures.'); }
    finally { setBusy(false); }
  };
  const save = async () => {
    if (!loaded) return;
    if (items.some(row => !Number.isInteger(row.charge) || row.charge < 0)) { setError('Enter non-negative whole-rupee charges.'); return; }
    setBusy(true); setError('');
    try { const result = await saveAppointmentProcedures(appointment.id, items); onSaved(result.appointment); setOpen(false); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not save procedures.'); }
    finally { setBusy(false); }
  };
  if (['Cancelled','NoShow','Rescheduled'].includes(appointment.status)) return null;
  return <>
    <button type="button" onClick={() => void load()} className="rounded-lg border border-sky-200 px-3 py-2 font-bold text-sky-700">Procedures / charges</button>
    {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><section role="dialog" aria-modal="true" aria-label="Patient procedure charges" className="max-h-[90vh] w-full max-w-xl overflow-auto rounded-2xl bg-white p-6 text-left text-gray-900">
      <h2 className="text-xl font-bold">Procedures — {appointment.patientName}</h2><p className="mb-4 text-sm">{appointment.department} · {appointment.date} · {appointment.doctorName}</p>
      {error && <p role="alert" className="mb-3 text-red-700">{error}</p>}
      <select aria-label="Add procedure" disabled={busy} value="" onChange={e => {const row=catalog.find(row=>row.id===e.target.value);if(row)setItems([...items,{procedureId:row.id,name:row.name,charge:row.charge}]);}} className="mb-4 w-full rounded-lg border p-3"><option value="">Add a procedure</option>{catalog.filter(row=>!items.some(item=>item.procedureId===row.id)).map(row=><option key={row.id} value={row.id}>{row.name} — ₹{row.charge} {row.description && `· ${row.description}`}</option>)}</select>
      {items.map((row,index)=><div key={row.procedureId} className="mb-3 flex items-center gap-3"><span className="flex-1">{row.name}</span><input aria-label={`${row.name} charge in rupees`} type="number" min="0" step="1" disabled={busy} value={Number.isNaN(row.charge)?'':row.charge} onChange={e=>setItems(items.map((item,i)=>i===index?{...item,charge:e.target.value===''?NaN:Number(e.target.value)}:item))} className="w-28 rounded-lg border p-2"/><button type="button" disabled={busy} onClick={()=>setItems(items.filter((_,i)=>i!==index))} className="text-red-700">Remove</button></div>)}
      {!items.length && <p className="mb-3 text-gray-500">No procedures added.</p>}
      <p className="font-bold">Procedure total: ₹{items.reduce((total,row)=>total+(row.charge||0),0)}</p><p className="mt-2 text-sm">Already collected: ₹{appointment.collectedAmount ?? 0}. Saving recalculates the bill and balance. Any overpayment must be reconciled at the counter.</p>
      <div className="mt-5 flex gap-3"><button type="button" disabled={busy || !loaded} onClick={()=>void save()} className="rounded-lg bg-sky-600 px-4 py-2 text-white">{busy?'Please wait…':'Save charges'}</button><button type="button" disabled={busy} onClick={()=>setOpen(false)} className="rounded-lg border px-4 py-2">Close</button></div>
    </section></div>}
  </>;
}
