import React from 'react';
import { Appointment, Department, LabRegistration, User } from '../../types';
import { Download, TrendingUp, Wallet } from 'lucide-react';
import { listAllAppointments, listDepartments, listRegistrations } from '../../services/clinicService';
import { downloadCsv } from '@/lib/downloadCsv';
import RegistrationEditor from '@/components/RegistrationEditor';

const currency = (value: number) => `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

const AdminRevenue: React.FC<{ user: User }> = () => {
  const [registrations, setRegistrations] = React.useState<LabRegistration[]>([]);
  const [appointments, setAppointments] = React.useState<Appointment[]>([]);
  const [departments, setDepartments] = React.useState<Department[]>([]);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    Promise.all([listRegistrations(), listAllAppointments(), listDepartments()])
      .then(([registrationRows, appointmentRows, departmentRows]) => {
        setRegistrations(registrationRows);
        setAppointments(appointmentRows);
        setDepartments(departmentRows);
        setError(null);
      })
      .catch(() => setError('Revenue data could not be loaded. Please try again.'));
  }, []);

  const completedAppointments = appointments.filter((row) => row.status === 'Completed');
  const doctorRevenue = completedAppointments.reduce((sum, row) => sum + row.fee * 0.5, 0);
  const totalRevenue = doctorRevenue;
  const totalTransactions = completedAppointments.length;
  const averageTicket = totalTransactions ? totalRevenue / totalTransactions : 0;
  const doctorPercent = totalRevenue ? (doctorRevenue / totalRevenue) * 100 : 0;

  const handleDownloadStatement = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const monthlyAppointments = completedAppointments.filter((row) => {
      const date = new Date(`${row.date}T00:00:00`);
      return date.getFullYear() === year && date.getMonth() === month;
    });
    downloadCsv(`bhcc-revenue-${year}-${String(month + 1).padStart(2, '0')}.csv`, [
      ['Type', 'Date', 'Reference', 'Description', 'Gross Amount', 'Clinic Revenue'],
      ...monthlyAppointments.map((row) => [
        'Doctor consultation', row.date, row.id, `${row.patientName} - ${row.doctorName}`, row.fee, row.fee * 0.5,
      ]),
    ]);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-10">
        <h1 className="text-3xl font-extrabold text-gray-900">Revenue Analytics</h1>
        <p className="text-gray-500">Live totals from completed paid doctor consultations. Patient registration and free camps have no registration charge.</p>
      </div>
      {error && <p className="mb-6 rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600">{error}</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
        <RevenueCard icon={<Wallet size={24} />} color="green" label="Total Clinic Revenue" value={currency(totalRevenue)} detail={`${totalTransactions} recorded transactions`} />
        <RevenueCard icon={<TrendingUp size={24} />} color="sky" label="Doctor Consultations (Share)" value={currency(doctorRevenue)} detail="50% clinic share of completed consultation fees" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm p-8">
          <h3 className="font-bold text-gray-900 mb-8">Revenue Breakdown</h3>
          <RevenueBar label="Doctor Consultations" value={doctorRevenue} percent={doctorPercent} color="bg-sky-500" />
        </div>

        <div className="bg-gray-900 rounded-[2.5rem] p-8 text-white shadow-xl">
          <h3 className="font-bold mb-6">Financial Summary</h3>
          <SummaryRow label="Total Transactions" value={String(totalTransactions)} />
          <SummaryRow label="Average Ticket Size" value={currency(averageTicket)} />
          <SummaryRow label="Statement Period" value={new Date().toLocaleString('en-IN', { month: 'long', year: 'numeric' })} />
          <div className="pt-7">
            <button type="button" onClick={handleDownloadStatement} className="w-full py-3 bg-sky-600 text-white rounded-xl font-bold hover:bg-sky-700 transition flex items-center justify-center">
              <Download size={18} className="mr-2" /> Download Monthly Statement
            </button>
          </div>
        </div>
      </div>
      <div className="mt-10 overflow-hidden rounded-3xl border bg-white">
        <div className="border-b p-6"><h2 className="text-xl font-bold">Patient registrations</h2><p className="text-sm text-gray-500">Administrators can correct mandatory patient details. Every change is recorded in the audit log.</p></div>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-gray-50"><tr><th className="p-4">Patient</th><th className="p-4">Type</th><th className="p-4">Department</th><th className="p-4">Token</th><th className="p-4"></th></tr></thead><tbody>{registrations.map((row) => <React.Fragment key={row.id}><tr className="border-t"><td className="p-4 font-bold">{row.name}<small className="block font-normal">{row.phoneNo} · Age {row.age} · {row.gender}</small><small className="block font-normal">{row.patientId}</small></td><td className="p-4">{row.isFreeCamp ? 'Free camp' : 'Clinic patient'}</td><td className="p-4">{row.departmentName}</td><td className="p-4">{row.tokenNumber}</td><td className="p-4"><button type="button" onClick={() => setEditingId(row.id)} className="font-bold text-sky-700">Edit details</button></td></tr>{editingId === row.id && <tr><td colSpan={5} className="p-4"><RegistrationEditor registration={row} departments={departments} onCancel={() => setEditingId(null)} onSaved={(updated) => { setRegistrations((current) => current.map((item) => item.id === updated.id ? updated : item)); setEditingId(null); }} /></td></tr>}</React.Fragment>)}</tbody></table></div>
      </div>
    </div>
  );
};

const RevenueCard = ({ icon, color, label, value, detail }: { icon: React.ReactNode; color: 'green' | 'sky' | 'purple'; label: string; value: string; detail: string }) => {
  const colors = { green: 'bg-green-50 text-green-600', sky: 'bg-sky-50 text-sky-600', purple: 'bg-purple-50 text-purple-600' };
  return <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm"><div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 ${colors[color]}`}>{icon}</div><p className="text-sm text-gray-500 font-bold mb-1">{label}</p><p className="text-3xl font-black text-gray-900">{value}</p><p className="text-xs text-gray-400 mt-2">{detail}</p></div>;
};

const RevenueBar = ({ label, value, percent, color }: { label: string; value: number; percent: number; color: string }) => <div className="mb-6"><div className="flex justify-between text-sm font-bold mb-2"><span className="text-gray-500">{label}</span><span className="text-gray-900">{currency(value)}</span></div><div className="w-full bg-gray-100 h-3 rounded-full overflow-hidden"><div className={`${color} h-full`} style={{ width: `${percent}%` }} /></div></div>;

const SummaryRow = ({ label, value }: { label: string; value: string }) => <div className="flex justify-between gap-4 py-4 border-b border-gray-800"><span className="text-gray-400">{label}</span><span className="font-bold text-right">{value}</span></div>;

export default AdminRevenue;
