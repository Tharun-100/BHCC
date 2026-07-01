import React from 'react';
import Link from 'next/link';
import { User, UserRole, WeeklySchedule } from '@/types';
import { getStaffProfile, StaffProfilePayload, updateStaffProfile } from '@/services/authService';
import { useAuth } from '@/providers/AuthProvider';
import { PRABHUPADA_BOOK_LISTS } from '@/constants';
import { ApiError } from '@/lib/api';
import { clearTokens } from '@/lib/storage';
import { useRouter } from 'next/navigation';
import { Briefcase, CalendarDays, Edit3, IndianRupee, Info, Loader2, Mail, MapPin, Phone, Save, Shield, Stethoscope, User as UserIcon, X } from 'lucide-react';

const roleLabels: Record<UserRole, string> = {
  [UserRole.PUBLIC]: 'Public',
  [UserRole.PATIENT]: 'Patient',
  [UserRole.DOCTOR]: 'Doctor',
  [UserRole.ADMIN]: 'Admin',
  [UserRole.COUNTER]: 'Counter',
  [UserRole.STAFF]: 'Staff'
};
const bookStatuses = ['Yet to Start', 'Just Started', 'Ongoing', 'Completed'];
type BookSize = keyof typeof PRABHUPADA_BOOK_LISTS;

const formFromUser = (user: User): StaffProfilePayload => ({
  name: user.name || '',
  phoneNo: user.patientProfile?.phoneNo || '',
  profession: user.patientProfile?.profession || '',
  address: user.patientProfile?.address || '',
  religion: user.patientProfile?.religion || '',
  iskconVisited: user.patientProfile?.iskconVisited || false,
  iskconVisitFrequency: user.patientProfile?.iskconVisitFrequency || '',
  chantsHareKrishna: user.patientProfile?.chantsHareKrishna || false,
  mahamantraRounds: user.patientProfile?.mahamantraRounds || null,
  prabhupadaBooks: user.patientProfile?.prabhupadaBooks || { small: '', medium: '', big: '' },
  department: user.department || '',
  specialty: user.specialty || '',
  experience: user.experience || '',
  fee: user.fee || null,
  weeklySchedule: user.weeklySchedule || {}
});

const formatWeeklySchedule = (schedule?: WeeklySchedule) => {
  const rows = Object.entries(schedule || {}).filter(([, windows]) => windows && windows.length > 0);
  if (rows.length === 0) return 'Not set';
  return rows.map(([day, windows]) => `${day}: ${windows.map((window) => `${window.start}-${window.end}`).join(', ')}`).join(' | ');
};

const DetailCard = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="bg-white border border-gray-100 rounded-3xl p-5 shadow-sm">
    <p className="text-xs font-black uppercase tracking-widest text-gray-400 mb-2">{label}</p>
    <div className="text-gray-900 font-bold">{value || 'Not provided'}</div>
  </div>
);

const BookInfo = ({ size }: { size: BookSize }) => (
  <details className="relative inline-block">
    <summary className="list-none cursor-pointer inline-flex items-center justify-center w-5 h-5 rounded-full bg-sky-100 text-sky-700 hover:bg-sky-200">
      <Info size={13} />
    </summary>
    <div className="absolute z-30 left-0 mt-2 w-72 max-h-72 overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl border border-sky-100 text-left">
      <p className="text-xs font-black uppercase tracking-widest text-sky-700 mb-3">{size} books</p>
      <ul className="space-y-2">
        {PRABHUPADA_BOOK_LISTS[size].map((book) => (
          <li key={book} className="text-xs font-semibold text-gray-700 leading-snug">- {book}</li>
        ))}
      </ul>
    </div>
  </details>
);

const StaffProfile: React.FC<{ user: User }> = ({ user: initialUser }) => {
  const router = useRouter();
  const { setUser: setAuthUser } = useAuth();
  const [user, setUser] = React.useState<User>(initialUser);
  const [form, setForm] = React.useState<StaffProfilePayload>(() => formFromUser(initialUser));
  const [isEditing, setIsEditing] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let mounted = true;
    getStaffProfile()
      .then((nextUser) => {
        if (!mounted) return;
        setUser(nextUser);
        setForm(formFromUser(nextUser));
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          clearTokens();
          setAuthUser(null);
          router.replace(`/stafflogin?next=${encodeURIComponent('/dashboard/profile')}`);
        }
      });
    return () => {
      mounted = false;
    };
  }, [router, setAuthUser]);

  const isDoctor = user.role === UserRole.DOCTOR;

  const handleCancel = () => {
    setForm(formFromUser(user));
    setIsEditing(false);
    setError(null);
    setMessage(null);
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    setMessage(null);

    const payload: StaffProfilePayload = {
      ...form,
      name: form.name.trim(),
      phoneNo: form.phoneNo.trim(),
      profession: form.profession.trim(),
      address: form.address.trim(),
      religion: form.religion,
      iskconVisited: form.religion === 'Muslim' || form.religion === 'Christian' ? false : form.iskconVisited,
      iskconVisitFrequency: form.religion === 'Muslim' || form.religion === 'Christian' ? '' : form.iskconVisitFrequency,
      chantsHareKrishna: form.religion === 'Muslim' || form.religion === 'Christian' ? false : form.chantsHareKrishna,
      mahamantraRounds: form.religion === 'Muslim' || form.religion === 'Christian' ? null : form.mahamantraRounds,
      prabhupadaBooks: form.religion === 'Muslim' || form.religion === 'Christian' ? { small: '', medium: '', big: '' } : form.prabhupadaBooks,
      department: isDoctor ? (form.department || '').trim() : undefined,
      specialty: isDoctor ? (form.specialty || '').trim() : undefined,
      experience: isDoctor ? (form.experience || '').trim() : undefined,
      weeklySchedule: isDoctor ? form.weeklySchedule || {} : undefined
    };

    try {
      const updatedUser = await updateStaffProfile(payload);
      setUser(updatedUser);
      setAuthUser(updatedUser);
      setForm(formFromUser(updatedUser));
      setIsEditing(false);
      setMessage('Profile updated successfully.');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearTokens();
        setAuthUser(null);
        setError('Your session expired. Please login again, then update your profile.');
        router.replace(`/stafflogin?next=${encodeURIComponent('/dashboard/profile')}`);
      } else {
        setError(err instanceof Error ? err.message : 'Could not update profile.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="bg-gray-900 rounded-[2.5rem] p-8 md:p-10 text-white mb-8 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center gap-6">
          <div className="w-20 h-20 rounded-3xl bg-white/10 flex items-center justify-center text-3xl font-black">
            {user.name.charAt(0)}
          </div>
          <div>
            <p className="text-sky-200 text-sm font-black uppercase tracking-widest mb-2">Staff Profile</p>
            <h1 className="text-3xl md:text-4xl font-black">{user.name}</h1>
            <p className="text-gray-300 mt-2">Email and role are locked. Other profile details can be updated here.</p>
          </div>
          <div className="md:ml-auto flex flex-col md:items-end gap-3">
            <div className="inline-flex items-center px-4 py-2 bg-white/10 rounded-2xl text-sm font-black">
              <Shield size={16} className="mr-2 text-sky-300" /> {roleLabels[user.role]}
            </div>
            {!isEditing ? (
              <button onClick={() => setIsEditing(true)} className="inline-flex items-center px-5 py-3 bg-white text-gray-900 rounded-2xl font-black hover:bg-sky-50 transition">
                <Edit3 size={18} className="mr-2" /> Edit Profile
              </button>
            ) : (
              <button onClick={handleCancel} className="inline-flex items-center px-5 py-3 bg-white/10 text-white rounded-2xl font-black hover:bg-white/20 transition">
                <X size={18} className="mr-2" /> Cancel
              </button>
            )}
          </div>
        </div>
      </div>

      {message && <div className="mb-6 bg-green-50 border border-green-100 text-green-700 px-5 py-4 rounded-2xl text-sm font-bold">{message}</div>}
      {error && <div className="mb-6 bg-red-50 border border-red-100 text-red-600 px-5 py-4 rounded-2xl text-sm font-bold">{error}</div>}

      {isEditing ? (
        <form onSubmit={handleSave} className="bg-white border border-gray-100 rounded-[2.5rem] p-6 md:p-8 shadow-sm space-y-8">
          <section>
            <h2 className="text-xl font-black text-gray-900 mb-5 flex items-center">
              <UserIcon size={20} className="mr-2 text-sky-600" /> Edit Basic Details
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <input required className="px-4 py-4 bg-gray-50 border-2 border-transparent rounded-2xl focus:bg-white focus:border-sky-500 text-gray-900" placeholder="Full Name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
              <input readOnly type="email" className="px-4 py-4 bg-gray-100 border-2 border-transparent rounded-2xl text-gray-500 cursor-not-allowed" value={user.email} />
              <input required className="px-4 py-4 bg-gray-50 border-2 border-transparent rounded-2xl focus:bg-white focus:border-sky-500 text-gray-900" placeholder="Phone No" value={form.phoneNo} onChange={(event) => setForm({ ...form, phoneNo: event.target.value })} />
              <input className="px-4 py-4 bg-gray-50 border-2 border-transparent rounded-2xl focus:bg-white focus:border-sky-500 text-gray-900" placeholder="Profession / Designation" value={form.profession} onChange={(event) => setForm({ ...form, profession: event.target.value })} />
              <input readOnly className="px-4 py-4 bg-gray-100 border-2 border-transparent rounded-2xl text-gray-500 cursor-not-allowed" value={user.staffType || roleLabels[user.role]} />
              <input readOnly className="px-4 py-4 bg-gray-100 border-2 border-transparent rounded-2xl text-gray-500 cursor-not-allowed" value={user.salary ? `Salary: Rs. ${user.salary}` : 'Salary: Admin controlled'} />
              <textarea className="md:col-span-2 px-4 py-4 bg-gray-50 border-2 border-transparent rounded-2xl focus:bg-white focus:border-sky-500 text-gray-900" placeholder="Address" rows={3} value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} />
            </div>
          </section>

          <section>
            <h2 className="text-xl font-black text-gray-900 mb-5">Spiritual Life</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <select className="px-4 py-4 bg-gray-50 border-2 border-transparent rounded-2xl focus:bg-white focus:border-sky-500 text-gray-900" value={form.religion || ''} onChange={(event) => setForm({ ...form, religion: event.target.value })}>
                <option value="">Select religion</option>
                {['Hindu', 'Muslim', 'Christian', 'Others'].map((religion) => <option key={religion} value={religion}>{religion}</option>)}
              </select>
              {form.religion && !['Muslim', 'Christian'].includes(form.religion) && (
                <>
                  <label className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl font-bold text-gray-700">
                    Visited ISKCON temple?
                    <input type="checkbox" checked={Boolean(form.iskconVisited)} onChange={(event) => setForm({ ...form, iskconVisited: event.target.checked })} className="w-5 h-5" />
                  </label>
                  {form.iskconVisited && <input className="px-4 py-4 bg-gray-50 border-2 border-transparent rounded-2xl focus:bg-white focus:border-sky-500 text-gray-900" placeholder="Visit frequency" value={form.iskconVisitFrequency || ''} onChange={(event) => setForm({ ...form, iskconVisitFrequency: event.target.value })} />}
                  <label className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl font-bold text-gray-700">
                    Chant Hare Krishna daily?
                    <input type="checkbox" checked={Boolean(form.chantsHareKrishna)} onChange={(event) => setForm({ ...form, chantsHareKrishna: event.target.checked })} className="w-5 h-5" />
                  </label>
                  {form.chantsHareKrishna && <input type="number" min={0} className="px-4 py-4 bg-gray-50 border-2 border-transparent rounded-2xl focus:bg-white focus:border-sky-500 text-gray-900" placeholder="Rounds" value={form.mahamantraRounds ?? ''} onChange={(event) => setForm({ ...form, mahamantraRounds: event.target.value ? Number(event.target.value) : null })} />}
                  {(['small', 'medium', 'big'] as const).map((size) => (
                    <div key={size} className="space-y-2">
                      <div className="flex items-center gap-2 ml-1">
                        <label className="text-xs font-bold text-sky-700 uppercase tracking-widest">{size} books</label>
                        <BookInfo size={size} />
                      </div>
                      <select className="w-full px-4 py-4 bg-gray-50 border-2 border-transparent rounded-2xl focus:bg-white focus:border-sky-500 text-gray-900" value={form.prabhupadaBooks?.[size] || ''} onChange={(event) => setForm({ ...form, prabhupadaBooks: { ...(form.prabhupadaBooks || { small: '', medium: '', big: '' }), [size]: event.target.value } })}>
                        <option value="">Select status</option>
                        {bookStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
                      </select>
                    </div>
                  ))}
                </>
              )}
            </div>
          </section>

          {isDoctor && (
            <section>
              <h2 className="text-xl font-black text-gray-900 mb-5 flex items-center">
                <Stethoscope size={20} className="mr-2 text-sky-600" /> Edit Doctor Details
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <input required className="px-4 py-4 bg-gray-50 border-2 border-transparent rounded-2xl focus:bg-white focus:border-sky-500 text-gray-900" placeholder="Department" value={form.department || ''} onChange={(event) => setForm({ ...form, department: event.target.value })} />
                <input required className="px-4 py-4 bg-gray-50 border-2 border-transparent rounded-2xl focus:bg-white focus:border-sky-500 text-gray-900" placeholder="Specialty" value={form.specialty || ''} onChange={(event) => setForm({ ...form, specialty: event.target.value })} />
                <input required className="px-4 py-4 bg-gray-50 border-2 border-transparent rounded-2xl focus:bg-white focus:border-sky-500 text-gray-900" placeholder="Experience" value={form.experience || ''} onChange={(event) => setForm({ ...form, experience: event.target.value })} />
                <input readOnly className="px-4 py-4 bg-gray-100 border-2 border-transparent rounded-2xl text-gray-500 cursor-not-allowed" placeholder="Consultation Fee" value={user.fee ? `Rs. ${user.fee}` : 'Admin controlled'} />
                <div className="md:col-span-2 rounded-2xl bg-sky-50 border border-sky-100 p-4 text-sm text-sky-800 font-bold">
                  Weekly timings are managed from <Link href="/dashboard/schedule" className="underline">My Schedule - Manage Availability</Link>.
                </div>
              </div>
            </section>
          )}

          <button type="submit" disabled={isSaving} className="inline-flex items-center px-6 py-4 bg-sky-600 text-white rounded-2xl font-black hover:bg-sky-700 transition disabled:opacity-50">
            {isSaving ? <Loader2 className="animate-spin mr-2" size={18} /> : <Save className="mr-2" size={18} />}
            Save Profile
          </button>
        </form>
      ) : (
        <>
          <section className="mb-10">
            <h2 className="text-xl font-black text-gray-900 mb-5 flex items-center">
              <UserIcon size={20} className="mr-2 text-sky-600" /> Basic Details
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              <DetailCard label="Full Name" value={user.name} />
              <DetailCard label="Role" value={roleLabels[user.role]} />
              <DetailCard label="Staff Type" value={user.staffType || (user.role === UserRole.STAFF ? 'General Staff' : roleLabels[user.role])} />
              <DetailCard label="Email ID" value={<span className="inline-flex items-center"><Mail size={16} className="mr-2 text-sky-600" />{user.email}</span>} />
              <DetailCard label="Phone No" value={<span className="inline-flex items-center"><Phone size={16} className="mr-2 text-sky-600" />{user.patientProfile?.phoneNo}</span>} />
              <DetailCard label="Profession" value={<span className="inline-flex items-center"><Briefcase size={16} className="mr-2 text-sky-600" />{user.patientProfile?.profession}</span>} />
              <DetailCard label="Salary" value={user.salary ? `Rs. ${user.salary}` : 'Admin controlled'} />
              <div className="md:col-span-2 lg:col-span-3">
                <DetailCard label="Address" value={<span className="inline-flex items-start"><MapPin size={16} className="mr-2 mt-1 text-sky-600 shrink-0" />{user.patientProfile?.address}</span>} />
              </div>
            </div>
          </section>

          {isDoctor && (
            <section>
              <h2 className="text-xl font-black text-gray-900 mb-5 flex items-center">
                <Stethoscope size={20} className="mr-2 text-sky-600" /> Doctor Details
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                <DetailCard label="Department" value={user.department} />
                <DetailCard label="Specialty" value={user.specialty} />
                <DetailCard label="Experience" value={user.experience} />
                <DetailCard label="Consultation Fee" value={user.fee ? <span className="inline-flex items-center"><IndianRupee size={16} className="mr-1 text-sky-600" />{user.fee}</span> : null} />
                <div className="lg:col-span-2">
                  <DetailCard label="Weekly Schedule" value={<span className="inline-flex items-start"><CalendarDays size={16} className="mr-2 mt-1 text-sky-600 shrink-0" />{formatWeeklySchedule(user.weeklySchedule)}</span>} />
                </div>
              </div>
            </section>
          )}

          <section className="mt-10">
            <h2 className="text-xl font-black text-gray-900 mb-5">Spiritual Life</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              <DetailCard label="Religion" value={user.patientProfile?.religion} />
              {!['Muslim', 'Christian'].includes(user.patientProfile?.religion || '') && (
                <>
                  <DetailCard label="Visited ISKCON Temple" value={user.patientProfile?.iskconVisited ? 'Yes' : 'No'} />
                  <DetailCard label="Visit Frequency" value={user.patientProfile?.iskconVisitFrequency} />
                  <DetailCard label="Daily Mahamantra Chanting" value={user.patientProfile?.chantsHareKrishna ? 'Yes' : 'No'} />
                  <DetailCard label="Daily Rounds" value={user.patientProfile?.mahamantraRounds ?? 'Not provided'} />
                  <DetailCard label="Small Books" value={<span className="inline-flex items-center gap-2">{user.patientProfile?.prabhupadaBooks.small}<BookInfo size="small" /></span>} />
                  <DetailCard label="Medium Books" value={<span className="inline-flex items-center gap-2">{user.patientProfile?.prabhupadaBooks.medium}<BookInfo size="medium" /></span>} />
                  <DetailCard label="Big Books" value={<span className="inline-flex items-center gap-2">{user.patientProfile?.prabhupadaBooks.big}<BookInfo size="big" /></span>} />
                </>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
};

export default StaffProfile;
