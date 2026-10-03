import React from 'react';
import Link from 'next/link';
import { CheckCircle, Clock, DollarSign, MapPin, Users } from 'lucide-react';
import { Appointment, User, WeekDayName } from '../../types';
import { listDoctorAppointments } from '../../services/clinicService';

const formatDayWindows = (windows?: Array<{ start: string; end: string }>) => windows?.length ? windows.map((window) => `${window.start}-${window.end}`).join(', ') : 'Off';
const netConsultation = (row: Appointment) => Math.max(0, (row.baseConsultationFee ?? row.fee) - (row.concessionAmount ?? 0));
const doctorShare = (row: Appointment) => row.doctorShareAmount ?? Math.floor(netConsultation(row) / 2);

const DoctorDashboard: React.FC<{ user: User }> = ({ user }) => {
  const [appointments, setAppointments] = React.useState<Appointment[]>([]);
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = React.useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);

  React.useEffect(() => {
    let mounted = true;
    listDoctorAppointments(user.id).then((rows) => mounted && setAppointments(rows)).catch(() => mounted && setAppointments([]));
    return () => { mounted = false; };
  }, [user.id]);

  const monthRows = appointments.filter((row) => row.date.startsWith(selectedMonth));
  const eligible = monthRows.filter((row) => row.status === 'Completed' && row.paymentStatus === 'Confirmed');
  const todayKey = new Date().toLocaleDateString('en-CA');
  const todayRows = appointments.filter((row) => row.date === todayKey);
  const pendingToday = todayRows.filter((row) => row.status === 'Upcoming');
  const uniquePatients = new Set(monthRows.filter((row) => !['Cancelled', 'Rescheduled'].includes(row.status)).map((row) => row.patientId)).size;
  const netRevenue = eligible.reduce((total, row) => total + netConsultation(row), 0);
  const earnings = eligible.reduce((total, row) => total + doctorShare(row), 0);

  return <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
    <div className="mb-10 flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-3xl font-extrabold text-gray-900">Welcome, {user.name}</h1><p className="text-gray-500">Live consultation activity and accrued share.</p></div><div className="flex flex-wrap items-end gap-3"><label className="text-sm font-bold text-gray-600">Reporting month<input type="month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} className="mt-1 block rounded-xl border px-3 py-2 text-gray-900" /></label><Link href="/dashboard/payroll" className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 font-bold text-sky-700">My Payroll</Link></div></div>
    <div className="mb-12 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">{[
      { icon: <Users />, tone: 'bg-sky-50 text-sky-600', label: 'Patients This Month', value: uniquePatients.toLocaleString('en-IN') },
      { icon: <Clock />, tone: 'bg-amber-50 text-amber-600', label: 'Appointments Today', value: `${pendingToday.length} Pending` },
      { icon: <DollarSign />, tone: 'bg-green-50 text-green-600', label: 'Your 50% Consultation Share', value: `₹${earnings.toLocaleString('en-IN')}`, note: 'Paid and completed consultations only' },
      { icon: <CheckCircle />, tone: 'bg-purple-50 text-purple-600', label: 'Paid Consultations This Month', value: eligible.length.toLocaleString('en-IN') },
    ].map((card) => <div key={card.label} className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm"><div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-2xl ${card.tone}`}>{card.icon}</div><p className="mb-1 text-sm font-bold text-gray-500">{card.label}</p><p className="text-2xl font-black text-gray-900">{card.value}</p>{card.note && <p className="mt-1 text-xs text-gray-500">{card.note}</p>}</div>)}</div>
    <div className="mb-8 overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-5"><div><h3 className="font-bold text-gray-900">Monthly consultation statement</h3><p className="text-sm text-gray-500">Share is 50% of the net consultation fee after concession. Dental procedures are excluded.</p></div><span className="font-black text-sky-700">Net collected ₹{netRevenue.toLocaleString('en-IN')}</span></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-gray-50"><tr><th className="p-4">Date / Patient</th><th className="p-4">Standard fee</th><th className="p-4">Concession</th><th className="p-4">Net consultation</th><th className="p-4">Doctor share</th></tr></thead><tbody>{eligible.map((row) => { const base = row.baseConsultationFee ?? row.fee; const concession = row.concessionAmount ?? 0; const net = netConsultation(row); return <tr key={row.id} className="border-t"><td className="p-4"><b>{row.patientName}</b><small className="block text-gray-500">{row.date} · {row.time}</small></td><td className="p-4">₹{base.toLocaleString('en-IN')}</td><td className="p-4">{row.concessionPercent ? `${row.concessionPercent}% · ₹${concession.toLocaleString('en-IN')}` : '—'}</td><td className="p-4 font-bold">₹{net.toLocaleString('en-IN')}</td><td className="p-4 font-black text-emerald-700">₹{doctorShare(row).toLocaleString('en-IN')}</td></tr>; })}{eligible.length === 0 && <tr><td colSpan={5} className="p-8 text-center font-bold text-gray-400">No paid, completed consultations for this month.</td></tr>}</tbody></table></div></div>
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-3"><div className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm lg:col-span-2"><div className="flex items-center justify-between border-b px-8 py-6"><h3 className="font-bold">Today's queue</h3><span className="flex items-center rounded-full bg-sky-50 px-3 py-1 text-xs font-bold text-sky-600"><MapPin size={12} className="mr-1" />Main Wing</span></div><div className="divide-y">{todayRows.map((row) => <div key={row.id} className="flex flex-col justify-between px-8 py-6 sm:flex-row sm:items-center"><div className="flex items-center gap-6"><b className="w-16 text-lg text-sky-600">{row.time}</b><div><h4 className="font-bold">{row.patientName}</h4><p className="text-xs text-gray-500">{row.tokenNumber || 'In-person appointment'}</p></div></div><span className={`mt-4 rounded-full px-3 py-1 text-[10px] font-black uppercase sm:mt-0 ${row.status === 'Completed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{row.status}</span></div>)}{todayRows.length === 0 && <p className="px-8 py-10 text-center text-sm font-bold text-gray-400">No appointments scheduled for today.</p>}</div></div>
      <div className="rounded-3xl bg-gray-900 p-8 text-white shadow-xl"><h3 className="mb-8 text-xl font-bold">Weekly Availability</h3><div className="space-y-4">{(['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'] as WeekDayName[]).map((day) => { const windows = user.weeklySchedule?.[day] || []; return <div key={day} className="flex items-start justify-between gap-4"><span className={`text-sm ${windows.length ? 'font-bold text-white' : 'text-gray-600'}`}>{day}</span><span className={`rounded-lg px-2 py-1 text-right text-xs ${windows.length ? 'bg-sky-500/20 text-sky-400' : 'bg-gray-800 text-gray-700'}`}>{formatDayWindows(windows)}</span></div>; })}</div></div></div>
  </div>;
};

export default DoctorDashboard;
