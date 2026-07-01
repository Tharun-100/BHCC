
import React from 'react';
import { User } from '../../types';
import { Download, Search, MoreVertical } from 'lucide-react';
import { listDoctorAppointments, listDoctors } from '../../services/clinicService';
import { ApiError, apiFetch } from '@/lib/api';
import { clearTokens, getAccessToken } from '@/lib/storage';
import { useRouter } from 'next/navigation';

const AdminDoctors: React.FC<{ user: User }> = ({ user }) => {
  const router = useRouter();
  const [doctorStats, setDoctorStats] = React.useState<Array<User & { cleared: number; revenue: number }>>([]);
  const [isCreating, setIsCreating] = React.useState(false);
  const [createError, setCreateError] = React.useState<string | null>(null);
  const [form, setForm] = React.useState({
    name: '',
    email: '',
    password: '',
    department: '',
    specialty: '',
    experience: '',
    fee: '',
    salary: '',
    phoneNo: '',
    profession: '',
    address: '',
    availableDays: 'Monday,Wednesday,Friday',
    start: '09:00',
    end: '13:00',
  });

  const loadDoctors = React.useCallback(async () => {
    const doctors = await listDoctors();
    const stats = await Promise.all(
      doctors.map(async (doc) => {
        const appointments = await listDoctorAppointments(doc.id);
        const completed = appointments.filter((a) => a.status === 'Completed');
        const revenue = completed.reduce((sum, row) => sum + row.fee, 0);
        return {
          ...doc,
          cleared: completed.length,
          revenue,
        };
      })
    );
    setDoctorStats(stats);
  }, []);

  React.useEffect(() => {
    loadDoctors().catch(() => setDoctorStats([]));
  }, [loadDoctors]);

  const handleCreateDoctor = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setIsCreating(true);

    try {
      const fee = Number(form.fee);
      if (
        !form.name.trim() ||
        !form.email.trim() ||
        !form.password.trim() ||
        !form.department.trim() ||
        !form.specialty.trim() ||
        !form.experience.trim() ||
        !form.phoneNo.trim() ||
        Number.isNaN(fee) ||
        fee <= 0
      ) {
        throw new Error('Please complete all doctor fields with a valid fee and phone number.');
      }

      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated.');

      await apiFetch<{ uid: string; email: string }>('/api/admin/create-doctor/', {
        method: 'POST',
        authToken: token,
        body: JSON.stringify({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        department: form.department.trim(),
        specialty: form.specialty.trim(),
        experience: form.experience.trim(),
        fee,
        salary: Number(form.salary) || null,
        phoneNo: form.phoneNo.trim(),
        profession: form.profession.trim(),
        address: form.address.trim(),
        availableDays: form.availableDays
          .split(',')
          .map((d) => d.trim())
          .filter(Boolean),
        workingHours: { start: form.start, end: form.end },
        })
      });

      setForm({
        name: '',
        email: '',
        password: '',
        department: '',
        specialty: '',
        experience: '',
        fee: '',
        salary: '',
        phoneNo: '',
        profession: '',
        address: '',
        availableDays: 'Monday,Wednesday,Friday',
        start: '09:00',
        end: '13:00',
      });
      await loadDoctors();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearTokens();
        setCreateError('Admin session expired. Please login again, then create the doctor profile.');
        router.replace('/stafflogin?role=ADMIN&next=/dashboard/doctors');
      } else {
        setCreateError(err instanceof Error ? err.message : 'Could not create doctor account.');
      }
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-10">
        <h1 className="text-3xl font-extrabold text-gray-900">Doctors Directory</h1>
        <p className="text-gray-500">Manage clinic doctors and monitor their performance.</p>
      </div>

      <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm p-6 mb-8">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Create Doctor Account</h2>
        <form onSubmit={handleCreateDoctor} className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input className="px-4 py-3 rounded-xl border border-gray-200" placeholder="Name" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
          <input className="px-4 py-3 rounded-xl border border-gray-200" placeholder="Email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
          <input type="password" className="px-4 py-3 rounded-xl border border-gray-200" placeholder="Temp Password" value={form.password} onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))} />
          <input className="px-4 py-3 rounded-xl border border-gray-200" placeholder="Department" value={form.department} onChange={(e) => setForm((p) => ({ ...p, department: e.target.value }))} />
          <input className="px-4 py-3 rounded-xl border border-gray-200" placeholder="Specialty" value={form.specialty} onChange={(e) => setForm((p) => ({ ...p, specialty: e.target.value }))} />
          <input className="px-4 py-3 rounded-xl border border-gray-200" placeholder="Experience (e.g. 8 Years)" value={form.experience} onChange={(e) => setForm((p) => ({ ...p, experience: e.target.value }))} />
          <input type="number" className="px-4 py-3 rounded-xl border border-gray-200" placeholder="Consultation Fee" value={form.fee} onChange={(e) => setForm((p) => ({ ...p, fee: e.target.value }))} />
          <input type="number" className="px-4 py-3 rounded-xl border border-gray-200" placeholder="Salary (admin only)" value={form.salary} onChange={(e) => setForm((p) => ({ ...p, salary: e.target.value }))} />
          <input className="px-4 py-3 rounded-xl border border-gray-200" placeholder="Phone No" value={form.phoneNo} onChange={(e) => setForm((p) => ({ ...p, phoneNo: e.target.value }))} />
          <input className="px-4 py-3 rounded-xl border border-gray-200" placeholder="Profession" value={form.profession} onChange={(e) => setForm((p) => ({ ...p, profession: e.target.value }))} />
          <input className="px-4 py-3 rounded-xl border border-gray-200" placeholder="Available Days comma-separated" value={form.availableDays} onChange={(e) => setForm((p) => ({ ...p, availableDays: e.target.value }))} />
          <div className="flex gap-2">
            <input type="time" className="w-1/2 px-3 py-3 rounded-xl border border-gray-200" value={form.start} onChange={(e) => setForm((p) => ({ ...p, start: e.target.value }))} />
            <input type="time" className="w-1/2 px-3 py-3 rounded-xl border border-gray-200" value={form.end} onChange={(e) => setForm((p) => ({ ...p, end: e.target.value }))} />
          </div>
          <textarea className="md:col-span-3 px-4 py-3 rounded-xl border border-gray-200" placeholder="Address" value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} />
          <button type="submit" disabled={isCreating} className="md:col-span-3 mt-1 py-3 bg-sky-600 text-white rounded-xl font-bold hover:bg-sky-700 disabled:opacity-60">
            {isCreating ? 'Creating doctor...' : 'Create Doctor'}
          </button>
          {createError && <p className="md:col-span-3 text-sm text-red-600">{createError}</p>}
        </form>
      </div>

      <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-8 py-6 border-b border-gray-100 flex items-center justify-between">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input 
              type="text" 
              placeholder="Search doctor..." 
              className="pl-10 pr-4 py-2 bg-gray-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-sky-500"
            />
          </div>
          <button className="text-sm font-bold text-sky-600 hover:text-sky-700 flex items-center">
            <Download size={16} className="mr-2" /> Download Report
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-8 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Doctor</th>
                <th className="px-8 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Specialty</th>
                <th className="px-8 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider text-center">Cleared Appointments</th>
                <th className="px-8 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Total Revenue</th>
                <th className="px-8 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Clinic Share (50%)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {doctorStats.map((doc) => (
                <tr key={doc.id} className="hover:bg-gray-50 transition">
                  <td className="px-8 py-5">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-sky-50 text-sky-600 rounded-xl flex items-center justify-center font-black text-xs">
                        {doc.name.split(' ').pop()?.charAt(0)}
                      </div>
                      <span className="font-bold text-gray-900">{doc.name}</span>
                    </div>
                  </td>
                  <td className="px-8 py-5 text-sm text-gray-500">{doc.specialty}</td>
                  <td className="px-8 py-5 text-sm font-bold text-gray-900 text-center">
                    <span className="bg-green-50 text-green-700 px-3 py-1 rounded-full">{doc.cleared}</span>
                  </td>
                  <td className="px-8 py-5 text-sm font-black text-gray-900 text-right">₹{doc.revenue.toLocaleString()}</td>
                  <td className="px-8 py-5 text-sm font-bold text-sky-600 text-right">₹{(doc.revenue / 2).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminDoctors;
