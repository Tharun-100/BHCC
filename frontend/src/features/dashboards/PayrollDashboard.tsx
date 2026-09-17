'use client';

import React from 'react';
import { PayrollRecord, User, UserRole } from '@/types';
import { generatePayroll, listPayroll, updatePayrollStatus } from '@/services/clinicService';

const currentMonth = () => new Date().toISOString().slice(0, 7);

export default function PayrollDashboard({user}: {user: User}) {
  const [month, setMonth] = React.useState(currentMonth());
  const [rows, setRows] = React.useState<PayrollRecord[]>([]);
  const [message, setMessage] = React.useState('');
  const isAdmin = user.role === UserRole.ADMIN;
  const load = React.useCallback(() => listPayroll(month).then(setRows).catch((error:any)=>setMessage(error?.message || 'Unable to load payroll.')), [month]);
  React.useEffect(()=>{load();},[load]);
  const createMonth = async () => { setRows(await generatePayroll(month)); setMessage('Monthly payroll records are ready for review.'); };
  const markPaid = async (row: PayrollRecord) => {
    if (!window.confirm(`Confirm that the monthly payout of ₹${row.amount} to ${row.employeeName} has been completed?`)) return;
    const paymentMethod = window.prompt('Payment method (cash, bank transfer, UPI, etc.):', row.paymentMethod || '') || '';
    const reference = window.prompt('Payment reference (optional):', row.reference || '') || '';
    const updated = await updatePayrollStatus(row.id, {status:'PAID', paymentMethod, reference});
    setRows(previous=>previous.map(item=>item.id===updated.id?updated:item));
  };
  return <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
    <div className="mb-8"><h1 className="text-3xl font-black">Monthly Payroll</h1><p className="text-gray-500">Track monthly staff payouts. This records confirmation only and does not transfer money.</p></div>
    <div className="mb-6 flex flex-wrap items-end gap-3"><label className="font-bold">Month<input type="month" value={month} onChange={e=>setMonth(e.target.value)} className="ml-3 rounded-xl border p-3"/></label>{isAdmin&&<button onClick={createMonth} className="rounded-xl bg-sky-600 px-5 py-3 font-bold text-white">Prepare monthly payroll</button>}</div>
    {message&&<p className="mb-4 rounded-xl bg-sky-50 p-3 text-sky-800">{message}</p>}
    <div className="overflow-x-auto rounded-3xl border bg-white"><table className="w-full text-left text-sm"><thead className="bg-gray-50"><tr><th className="p-4">Employee</th><th className="p-4">Role</th><th className="p-4">Amount</th><th className="p-4">Status</th><th className="p-4">Payment details</th>{isAdmin&&<th className="p-4">Action</th>}</tr></thead><tbody>{rows.map(row=><tr key={row.id} className="border-t"><td className="p-4 font-bold">{row.employeeName}</td><td className="p-4">{row.employeeRole}</td><td className="p-4 font-bold">₹{row.amount.toLocaleString('en-IN')}</td><td className="p-4"><span className={row.status==='PAID'?'text-green-700':'text-amber-700'}>{row.status}</span></td><td className="p-4">{row.status==='PAID'?`${row.paymentDate || ''} ${row.paymentMethod || ''} ${row.reference || ''}`:'Awaiting admin confirmation'}</td>{isAdmin&&<td className="p-4">{row.status==='PENDING'?<button onClick={()=>markPaid(row)} className="rounded-lg bg-green-600 px-3 py-2 font-bold text-white">Confirm paid</button>:<span className="text-gray-500">Confirmed by {row.confirmedBy || 'Admin'}</span>}</td>}</tr>)}</tbody></table>{rows.length===0&&<p className="p-8 text-gray-500">No payroll records found.</p>}</div>
  </div>;
}
