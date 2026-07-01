import React from 'react';
import { UserRole } from '@/types';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/storage';
import { Shield, UserPlus } from 'lucide-react';

const AdminStaff: React.FC = () => {
  const [isCreating, setIsCreating] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [form, setForm] = React.useState({
    role: UserRole.COUNTER,
    name: '',
    email: '',
    password: '',
    phoneNo: '',
    profession: '',
    address: '',
    staffType: 'Receptionist',
    salary: '',
    religion: ''
  });

  const handleCreateStaff = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsCreating(true);
    setMessage(null);
    setError(null);

    try {
      if (!form.name.trim() || !form.email.trim() || !form.password.trim() || !form.phoneNo.trim()) {
        throw new Error('Name, email, password, and phone number are required.');
      }

      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated.');

      await apiFetch<{ uid: string; email: string; role: UserRole }>('/api/admin/create-staff/', {
        method: 'POST',
        authToken: token,
        body: JSON.stringify({
          role: form.role,
          name: form.name.trim(),
          email: form.email.trim(),
          password: form.password,
          phoneNo: form.phoneNo.trim(),
          profession: form.profession.trim(),
          address: form.address.trim(),
          staffType: form.role === UserRole.STAFF ? form.staffType : '',
          salary: Number(form.salary) || null,
          religion: form.religion
        })
      });

      setMessage(`${form.role === UserRole.ADMIN ? 'Admin' : form.role === UserRole.COUNTER ? 'Counter' : form.staffType} account created successfully.`);
      setForm({
        role: UserRole.COUNTER,
        name: '',
        email: '',
        password: '',
        phoneNo: '',
        profession: '',
        address: '',
        staffType: 'Receptionist',
        salary: '',
        religion: ''
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create staff account.');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-10">
        <h1 className="text-3xl font-extrabold text-gray-900 flex items-center">
          <Shield className="mr-3 text-sky-600" size={30} /> Staff Accounts
        </h1>
        <p className="text-gray-500">Create Admin, Counter, and general staff profiles. Staff can edit profile details, while salary remains admin-controlled.</p>
      </div>

      <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm p-6 md:p-8">
        <h2 className="text-xl font-bold text-gray-900 mb-5 flex items-center">
          <UserPlus className="mr-2 text-sky-600" size={22} /> Create Staff Account
        </h2>
        {message && <div className="mb-5 bg-green-50 border border-green-100 text-green-700 px-4 py-3 rounded-2xl text-sm font-bold">{message}</div>}
        {error && <div className="mb-5 bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-2xl text-sm font-bold">{error}</div>}
        <form onSubmit={handleCreateStaff} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <select className="px-4 py-3 rounded-xl border border-gray-200" value={form.role} onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value as UserRole.ADMIN | UserRole.COUNTER | UserRole.STAFF }))}>
            <option value={UserRole.COUNTER}>Counter</option>
            <option value={UserRole.ADMIN}>Admin</option>
            <option value={UserRole.STAFF}>General Staff</option>
          </select>
          {form.role === UserRole.STAFF && (
            <select className="px-4 py-3 rounded-xl border border-gray-200" value={form.staffType} onChange={(e) => setForm((prev) => ({ ...prev, staffType: e.target.value }))}>
              {['Receptionist', 'Nurse', 'Manager', 'Cleaner', 'Other'].map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          )}
          <input className="px-4 py-3 rounded-xl border border-gray-200" placeholder="Full Name" value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} />
          <input type="email" className="px-4 py-3 rounded-xl border border-gray-200" placeholder="Email" value={form.email} onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))} />
          <input type="password" className="px-4 py-3 rounded-xl border border-gray-200" placeholder="Temporary Password" value={form.password} onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))} />
          <input className="px-4 py-3 rounded-xl border border-gray-200" placeholder="Phone No" value={form.phoneNo} onChange={(e) => setForm((prev) => ({ ...prev, phoneNo: e.target.value }))} />
          <input className="px-4 py-3 rounded-xl border border-gray-200" placeholder="Profession / Designation" value={form.profession} onChange={(e) => setForm((prev) => ({ ...prev, profession: e.target.value }))} />
          <input type="number" className="px-4 py-3 rounded-xl border border-gray-200" placeholder="Salary (admin only)" value={form.salary} onChange={(e) => setForm((prev) => ({ ...prev, salary: e.target.value }))} />
          <select className="px-4 py-3 rounded-xl border border-gray-200" value={form.religion} onChange={(e) => setForm((prev) => ({ ...prev, religion: e.target.value }))}>
            <option value="">Religion</option>
            {['Hindu', 'Muslim', 'Christian', 'Others'].map((religion) => <option key={religion} value={religion}>{religion}</option>)}
          </select>
          <textarea className="md:col-span-2 px-4 py-3 rounded-xl border border-gray-200" placeholder="Address" value={form.address} onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))} />
          <button type="submit" disabled={isCreating} className="md:col-span-2 py-3 bg-sky-600 text-white rounded-xl font-bold hover:bg-sky-700 disabled:opacity-60">
            {isCreating ? 'Creating staff...' : 'Create Staff'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default AdminStaff;
