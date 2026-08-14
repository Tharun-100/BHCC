import React from 'react';
import { User, UserRole } from '@/types';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/storage';
import { Shield, Trash2, UserPlus } from 'lucide-react';
import { deleteStaffAccount, listStaffAccounts } from '@/services/clinicService';
import PasswordInput from '@/components/PasswordInput';

const AdminStaff: React.FC<{ currentUserId: string }> = ({ currentUserId }) => {
  const [isCreating, setIsCreating] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [staffAccounts, setStaffAccounts] = React.useState<User[]>([]);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
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

  const loadStaff = React.useCallback(async () => {
    setStaffAccounts(await listStaffAccounts());
  }, []);

  React.useEffect(() => {
    loadStaff().catch((err) => setError(err instanceof Error ? err.message : 'Could not load staff accounts.'));
  }, [loadStaff]);

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

      await apiFetch<{ uid: string; email: string; role: UserRole }>('/api/management/create-staff/', {
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
      await loadStaff();

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

  const handleDeleteStaff = async (staff: User) => {
    const confirmed = window.confirm(
      `CAUTION: Permanently delete ${staff.name} (${staff.email})?\n\nThis removes the staff login and profile and cannot be undone.`
    );
    if (!confirmed) return;
    setDeletingId(staff.id);
    setMessage(null);
    setError(null);
    try {
      await deleteStaffAccount(staff.id);
      setStaffAccounts((current) => current.filter((account) => account.id !== staff.id));
      setMessage(`${staff.name}'s staff account was permanently deleted.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete staff account.');
    } finally {
      setDeletingId(null);
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
            <PasswordInput className="px-4 py-3 rounded-xl border border-gray-200" placeholder="Temporary Password" value={form.password} onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))} />
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

      <div className="mt-8 bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 md:px-8 py-5 border-b border-gray-100">
          <h2 className="text-xl font-bold text-gray-900">Existing Staff Accounts</h2>
          <p className="text-sm text-gray-500">Deleting an account is permanent. Your currently signed-in administrator account is protected by the server.</p>
        </div>
        <div className="divide-y divide-gray-100">
          {staffAccounts.map((staff) => (
            <div key={staff.id} className="px-6 md:px-8 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <p className="font-bold text-gray-900">{staff.name}</p>
                <p className="text-sm text-gray-500">{staff.email} · {staff.role}</p>
              </div>
              <button type="button" onClick={() => handleDeleteStaff(staff)} disabled={deletingId === staff.id || staff.id === currentUserId} title={staff.id === currentUserId ? 'You cannot delete your currently signed-in administrator account.' : 'Permanently delete this staff account'} className="inline-flex items-center justify-center px-4 py-2 border border-red-200 text-red-600 rounded-xl font-bold hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed">
                <Trash2 size={16} className="mr-2" /> {staff.id === currentUserId ? 'Current account' : deletingId === staff.id ? 'Deleting…' : 'Delete permanently'}
              </button>
            </div>
          ))}
          {staffAccounts.length === 0 && <p className="px-8 py-8 text-sm text-gray-500">No staff accounts found.</p>}
        </div>
      </div>
    </div>
  );
};

export default AdminStaff;
