'use client';

import React from 'react';
import { AttendanceRecord, LeaveRequest, User, UserRole } from '@/types';
import { attendanceAction, correctAttendance, createLeaveRequest, listAdminAttendance, listAdminLeaveRequests, listMyAttendance, listMyLeaveRequests, reviewLeaveRequest } from '@/services/clinicalService';
import { downloadCsv } from '@/lib/downloadCsv';

export default function AttendanceDashboard({ user }: { user: User }) {
  const isAdmin = user.role === UserRole.ADMIN;
  const [rows, setRows] = React.useState<AttendanceRecord[]>([]);
  const [leaves, setLeaves] = React.useState<LeaveRequest[]>([]);
  const [month, setMonth] = React.useState(new Date().toISOString().slice(0, 7));
  const [message, setMessage] = React.useState('');
  const [form, setForm] = React.useState({ leaveType: 'Casual', startDate: '', endDate: '', reason: '' });

  const load = React.useCallback(async () => {
    const [attendance, leaveRows] = await Promise.all(isAdmin ? [listAdminAttendance(month), listAdminLeaveRequests()] : [listMyAttendance(), listMyLeaveRequests()]);
    setRows(attendance); setLeaves(leaveRows);
  }, [isAdmin, month]);
  React.useEffect(() => { load().catch((e) => setMessage(e instanceof Error ? e.message : 'Could not load attendance.')); }, [load]);

  const mark = async (action: 'CHECK_IN' | 'CHECK_OUT') => { try { await attendanceAction(action); await load(); setMessage(action === 'CHECK_IN' ? 'Checked in successfully.' : 'Checked out successfully.'); } catch (e) { setMessage(e instanceof Error ? e.message : 'Attendance could not be updated.'); } };
  const submitLeave = async (event: React.FormEvent) => { event.preventDefault(); try { await createLeaveRequest(form); setForm({ leaveType: 'Casual', startDate: '', endDate: '', reason: '' }); await load(); setMessage('Leave request submitted.'); } catch (e) { setMessage(e instanceof Error ? e.message : 'Could not submit leave request.'); } };
  const review = async (id: string, status: 'APPROVED' | 'REJECTED') => { await reviewLeaveRequest(id, status); await load(); };
  const correct = async (row: AttendanceRecord) => { const reason = window.prompt('Enter the audit reason for this correction:'); if (!reason) return; const status = window.prompt('Status: PRESENT, LATE, HALF_DAY, ABSENT, LEAVE or HOLIDAY', row.status); if (!status || !['PRESENT','LATE','HALF_DAY','ABSENT','LEAVE','HOLIDAY'].includes(status)) return; await correctAttendance(row.id, { status: status as AttendanceRecord['status'], adminNotes: reason, reason }); await load(); };
  const exportCsv = () => downloadCsv(`bhcc-attendance-${month}.csv`, [['Employee','Date','Check in','Check out','Status','Late minutes','Worked minutes'], ...rows.map((r) => [r.employee.name, r.date, r.checkedInAt || '', r.checkedOutAt || '', r.status, r.lateMinutes, r.workedMinutes])]);

  return <main className="max-w-7xl mx-auto px-4 py-10 space-y-8">
    <div className="flex flex-wrap justify-between gap-4"><div><h1 className="text-3xl font-black">Attendance & Leave</h1><p className="text-gray-500">Server-timestamped clinic attendance with an auditable correction history.</p></div>{isAdmin && <div className="flex gap-2"><input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="border rounded-xl px-3"/><button onClick={exportCsv} className="bg-gray-900 text-white px-5 py-3 rounded-xl font-bold">Export CSV</button></div>}</div>
    {message && <p className="bg-sky-50 text-sky-800 p-4 rounded-xl">{message}</p>}
    {!isAdmin && <section className="bg-white border rounded-3xl p-6"><h2 className="font-black text-xl mb-4">Today</h2><div className="flex gap-3"><button onClick={() => mark('CHECK_IN')} className="bg-green-600 text-white px-5 py-3 rounded-xl font-bold">Check in</button><button onClick={() => mark('CHECK_OUT')} className="bg-sky-600 text-white px-5 py-3 rounded-xl font-bold">Check out</button></div></section>}
    <section className="bg-white border rounded-3xl overflow-x-auto"><table className="w-full text-left"><thead className="bg-gray-50"><tr>{isAdmin && <th className="p-4">Employee</th>}<th className="p-4">Date</th><th className="p-4">Check in</th><th className="p-4">Check out</th><th className="p-4">Status</th><th className="p-4">Worked</th>{isAdmin && <th className="p-4">Action</th>}</tr></thead><tbody>{rows.map((r) => <tr key={r.id} className="border-t">{isAdmin && <td className="p-4 font-bold">{r.employee.name}</td>}<td className="p-4">{r.date}</td><td className="p-4">{r.checkedInAt ? new Date(r.checkedInAt).toLocaleTimeString() : '—'}</td><td className="p-4">{r.checkedOutAt ? new Date(r.checkedOutAt).toLocaleTimeString() : '—'}</td><td className="p-4">{r.status}</td><td className="p-4">{Math.floor(r.workedMinutes / 60)}h {r.workedMinutes % 60}m</td>{isAdmin && <td className="p-4"><button onClick={() => correct(r)} className="text-sky-700 font-bold">Correct</button></td>}</tr>)}</tbody></table>{!rows.length && <p className="p-6 text-gray-500">No attendance records found.</p>}</section>
    {!isAdmin && <form onSubmit={submitLeave} className="bg-white border rounded-3xl p-6 grid md:grid-cols-2 gap-3"><h2 className="md:col-span-2 font-black text-xl">Request leave</h2><input required value={form.leaveType} onChange={(e) => setForm({...form, leaveType:e.target.value})} placeholder="Leave type" className="border rounded-xl p-3"/><div className="flex gap-2"><input required type="date" value={form.startDate} onChange={(e) => setForm({...form,startDate:e.target.value})} className="border rounded-xl p-3 w-1/2"/><input required type="date" value={form.endDate} onChange={(e) => setForm({...form,endDate:e.target.value})} className="border rounded-xl p-3 w-1/2"/></div><textarea required value={form.reason} onChange={(e) => setForm({...form,reason:e.target.value})} placeholder="Reason" className="border rounded-xl p-3 md:col-span-2"/><button className="bg-sky-600 text-white rounded-xl p-3 font-bold md:col-span-2">Submit request</button></form>}
    <section className="bg-white border rounded-3xl p-6"><h2 className="font-black text-xl mb-4">Leave requests</h2><div className="space-y-3">{leaves.map((r) => <div key={r.id} className="border rounded-xl p-4 flex flex-wrap justify-between gap-3"><div><b>{isAdmin ? `${r.employee.name} — ` : ''}{r.leaveType}</b><p className="text-sm text-gray-500">{r.startDate} to {r.endDate}: {r.reason}</p></div><div className="flex items-center gap-2"><span className="font-bold">{r.status}</span>{isAdmin && r.status === 'PENDING' && <><button onClick={() => review(r.id,'APPROVED')} className="text-green-700 font-bold">Approve</button><button onClick={() => review(r.id,'REJECTED')} className="text-red-700 font-bold">Reject</button></>}</div></div>)}</div></section>
  </main>;
}
