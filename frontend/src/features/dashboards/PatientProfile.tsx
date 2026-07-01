import React from 'react';
import { PatientRegistrationPayload, User, UserRole } from '@/types';
import { getPatientProfile, updatePatientProfile } from '@/services/authService';
import { PRABHUPADA_BOOK_LISTS } from '@/constants';
import { useAuth } from '@/providers/AuthProvider';
import { BookOpen, Edit3, Heart, Home, Info, Loader2, Mail, Phone, Save, User as UserIcon, X } from 'lucide-react';

const disabledSpiritualReligions = ['muslim', 'christian'];
const religions = ['Hindu', 'Muslim', 'Christian', 'Others'];
const incomeRanges = ['Less than 1 lakh', '1-5 Lakhs', 'Greater than 5 Lakhs'];
const bookStatuses = ['Yet to Start', 'Just Started', 'Ongoing', 'Completed'];
type BookSize = keyof typeof PRABHUPADA_BOOK_LISTS;
type PatientProfileForm = Omit<PatientRegistrationPayload, 'password'>;

const emptyProfile = {
  address: '',
  phoneNo: '',
  profession: '',
  isMarried: false,
  hasChildren: false,
  annualIncomeRange: '',
  religion: '',
  iskconVisited: false,
  iskconVisitFrequency: '',
  chantsHareKrishna: false,
  mahamantraRounds: null,
  prabhupadaBooks: {
    small: '',
    medium: '',
    big: ''
  }
};

const profileFormFromUser = (user: User): PatientProfileForm => ({
  name: user.name || '',
  email: user.email || '',
  ...(user.patientProfile || emptyProfile),
  prabhupadaBooks: {
    ...emptyProfile.prabhupadaBooks,
    ...(user.patientProfile?.prabhupadaBooks || {})
  }
});

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

const PatientProfile: React.FC<{ initialUser: User }> = ({ initialUser }) => {
  const { setUser: setAuthUser } = useAuth();
  const [user, setUser] = React.useState<User>(initialUser);
  const [formData, setFormData] = React.useState<PatientProfileForm>(() => profileFormFromUser(initialUser));
  const [isEditing, setIsEditing] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let mounted = true;
    getPatientProfile()
      .then((nextUser) => {
        if (!mounted) return;
        setUser(nextUser);
        setFormData(profileFormFromUser(nextUser));
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);

  const profile = user.patientProfile;
  const selectedReligion = formData.religion.trim().toLowerCase();
  const canEditSpiritualFields = Boolean(selectedReligion) && !disabledSpiritualReligions.includes(selectedReligion);
  const profileReligion = profile?.religion || '';
  const canViewSpiritualFields = Boolean(profileReligion) && !disabledSpiritualReligions.includes(profileReligion.trim().toLowerCase());

  const handleCancel = () => {
    setFormData(profileFormFromUser(user));
    setIsEditing(false);
    setError(null);
    setMessage(null);
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    setMessage(null);

    const payload: PatientProfileForm = {
      ...formData,
      name: formData.name.trim(),
      email: user.email,
      address: formData.address.trim(),
      phoneNo: formData.phoneNo.trim(),
      profession: formData.profession.trim(),
      religion: formData.religion.trim(),
      hasChildren: formData.isMarried ? formData.hasChildren : false,
      iskconVisited: canEditSpiritualFields ? formData.iskconVisited : false,
      iskconVisitFrequency: canEditSpiritualFields ? formData.iskconVisitFrequency.trim() : '',
      chantsHareKrishna: canEditSpiritualFields ? formData.chantsHareKrishna : false,
      mahamantraRounds: canEditSpiritualFields ? formData.mahamantraRounds : null,
      prabhupadaBooks: canEditSpiritualFields ? formData.prabhupadaBooks : { small: '', medium: '', big: '' }
    };

    try {
      const updatedUser = await updatePatientProfile(payload);
      setUser(updatedUser);
      setAuthUser(updatedUser);
      setFormData(profileFormFromUser(updatedUser));
      setIsEditing(false);
      setMessage('Profile updated successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update profile.');
    } finally {
      setIsSaving(false);
    }
  };

  if (user.role !== UserRole.PATIENT) return null;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="bg-sky-900 rounded-[2.5rem] p-8 md:p-10 text-white mb-8 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center gap-6">
          <div className="w-20 h-20 rounded-3xl bg-white/10 flex items-center justify-center text-3xl font-black">
            {user.name.charAt(0)}
          </div>
          <div>
            <p className="text-sky-200 text-sm font-black uppercase tracking-widest mb-2">Patient Profile</p>
            <h1 className="text-3xl md:text-4xl font-black">{user.name}</h1>
            <p className="text-sky-100 mt-2">Your complete registration details are stored here.</p>
          </div>
          <div className="md:ml-auto">
            {!isEditing ? (
              <button
                onClick={() => {
                  setIsEditing(true);
                  setMessage(null);
                  setError(null);
                }}
                className="inline-flex items-center px-5 py-3 bg-white text-sky-900 rounded-2xl font-black hover:bg-sky-50 transition"
              >
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
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Full Name</label>
                <input required className="w-full px-4 py-4 bg-gray-50 border-2 border-transparent rounded-2xl focus:bg-white focus:border-sky-500 text-gray-900" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Email ID</label>
                <input readOnly type="email" className="w-full px-4 py-4 bg-gray-100 border-2 border-transparent rounded-2xl text-gray-500 cursor-not-allowed" value={user.email} />
                <p className="text-xs font-semibold text-gray-400 ml-1">Email cannot be updated after account creation.</p>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Phone No</label>
                <input required type="tel" className="w-full px-4 py-4 bg-gray-50 border-2 border-transparent rounded-2xl focus:bg-white focus:border-sky-500 text-gray-900" value={formData.phoneNo} onChange={(e) => setFormData({ ...formData, phoneNo: e.target.value })} />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Profession</label>
                <input required className="w-full px-4 py-4 bg-gray-50 border-2 border-transparent rounded-2xl focus:bg-white focus:border-sky-500 text-gray-900" value={formData.profession} onChange={(e) => setFormData({ ...formData, profession: e.target.value })} />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Annual Income</label>
                <select required className="w-full px-4 py-4 bg-gray-50 border-2 border-transparent rounded-2xl focus:bg-white focus:border-sky-500 text-gray-900" value={formData.annualIncomeRange} onChange={(e) => setFormData({ ...formData, annualIncomeRange: e.target.value })}>
                  <option value="">Select range</option>
                  {incomeRanges.map((range) => <option key={range} value={range}>{range}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Religion</label>
                <select required className="w-full px-4 py-4 bg-gray-50 border-2 border-transparent rounded-2xl focus:bg-white focus:border-sky-500 text-gray-900" value={formData.religion} onChange={(e) => setFormData({ ...formData, religion: e.target.value })}>
                  <option value="">Select religion</option>
                  {religions.map((religion) => <option key={religion} value={religion}>{religion}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Married</label>
                <div className="grid grid-cols-2 gap-3">
                  {[true, false].map((value) => (
                    <button key={String(value)} type="button" onClick={() => setFormData({ ...formData, isMarried: value, hasChildren: value ? formData.hasChildren : false })} className={`py-4 rounded-2xl border-2 font-bold transition ${formData.isMarried === value ? 'border-sky-500 bg-sky-50 text-sky-700' : 'border-gray-100 bg-gray-50 text-gray-500'}`}>
                      {value ? 'Yes' : 'No'}
                    </button>
                  ))}
                </div>
              </div>
              {formData.isMarried && (
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Children</label>
                  <div className="grid grid-cols-2 gap-3">
                    {[true, false].map((value) => (
                      <button key={String(value)} type="button" onClick={() => setFormData({ ...formData, hasChildren: value })} className={`py-4 rounded-2xl border-2 font-bold transition ${formData.hasChildren === value ? 'border-sky-500 bg-sky-50 text-sky-700' : 'border-gray-100 bg-gray-50 text-gray-500'}`}>
                        {value ? 'Yes' : 'No'}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="space-y-2 md:col-span-2">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Address</label>
                <textarea required rows={3} className="w-full px-4 py-4 bg-gray-50 border-2 border-transparent rounded-2xl focus:bg-white focus:border-sky-500 text-gray-900" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} />
              </div>
            </div>
          </section>

          {canEditSpiritualFields && (
            <section className="bg-sky-50/70 rounded-3xl p-5 border border-sky-100 space-y-5">
              <h2 className="text-lg font-black text-sky-900 flex items-center">
                <Heart size={20} className="mr-2 text-sky-600" /> ISKCON & Spiritual Reading
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="flex items-center justify-between p-4 bg-white rounded-2xl border border-sky-100 font-bold text-gray-700">
                  Visited ISKCON temple?
                  <input type="checkbox" checked={formData.iskconVisited} onChange={(e) => setFormData({ ...formData, iskconVisited: e.target.checked })} className="w-5 h-5" />
                </label>
                {formData.iskconVisited && (
                  <input type="text" placeholder="How frequently do you visit?" className="w-full px-4 py-4 bg-white border-2 border-transparent rounded-2xl focus:border-sky-500 text-gray-900" value={formData.iskconVisitFrequency} onChange={(e) => setFormData({ ...formData, iskconVisitFrequency: e.target.value })} />
                )}
                <label className="flex items-center justify-between p-4 bg-white rounded-2xl border border-sky-100 font-bold text-gray-700">
                  Chant Hare Krishna daily?
                  <input type="checkbox" checked={formData.chantsHareKrishna} onChange={(e) => setFormData({ ...formData, chantsHareKrishna: e.target.checked })} className="w-5 h-5" />
                </label>
                {formData.chantsHareKrishna && (
                  <input type="number" min={0} placeholder="How many rounds?" className="w-full px-4 py-4 bg-white border-2 border-transparent rounded-2xl focus:border-sky-500 text-gray-900" value={formData.mahamantraRounds ?? ''} onChange={(e) => setFormData({ ...formData, mahamantraRounds: e.target.value ? Number(e.target.value) : null })} />
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {(['small', 'medium', 'big'] as const).map((size) => (
                  <div key={size} className="space-y-2">
                    <div className="flex items-center gap-2 ml-1">
                      <label className="text-xs font-bold text-sky-700 uppercase tracking-widest">{size} books</label>
                      <BookInfo size={size} />
                    </div>
                    <select className="w-full px-4 py-4 bg-white border-2 border-transparent rounded-2xl focus:border-sky-500 text-gray-900" value={formData.prabhupadaBooks[size]} onChange={(e) => setFormData({ ...formData, prabhupadaBooks: { ...formData.prabhupadaBooks, [size]: e.target.value } })}>
                      <option value="">Select status</option>
                      {bookStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
                    </select>
                  </div>
                ))}
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
              <DetailCard label="Email ID" value={<span className="inline-flex items-center"><Mail size={16} className="mr-2 text-sky-600" />{user.email}</span>} />
              <DetailCard label="Phone No" value={<span className="inline-flex items-center"><Phone size={16} className="mr-2 text-sky-600" />{profile?.phoneNo}</span>} />
              <DetailCard label="Profession" value={profile?.profession} />
              <DetailCard label="Married" value={profile?.isMarried ? 'Yes' : 'No'} />
              <DetailCard label="Children" value={profile?.isMarried ? (profile?.hasChildren ? 'Yes' : 'No') : 'Not applicable'} />
              <DetailCard label="Annual Income" value={profile?.annualIncomeRange} />
              <DetailCard label="Religion" value={profile?.religion} />
              <div className="md:col-span-2 lg:col-span-3">
                <DetailCard label="Address" value={<span className="inline-flex items-start"><Home size={16} className="mr-2 mt-1 text-sky-600 shrink-0" />{profile?.address}</span>} />
              </div>
            </div>
          </section>

          {canViewSpiritualFields && (
            <section>
              <h2 className="text-xl font-black text-gray-900 mb-5 flex items-center">
                <Heart size={20} className="mr-2 text-sky-600" /> ISKCON & Spiritual Reading
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                <DetailCard label="Visited ISKCON Temple" value={profile?.iskconVisited ? 'Yes' : 'No'} />
                <DetailCard label="Visit Frequency" value={profile?.iskconVisitFrequency} />
                <DetailCard label="Daily Mahamantra Chanting" value={profile?.chantsHareKrishna ? 'Yes' : 'No'} />
                <DetailCard label="Daily Rounds" value={profile?.mahamantraRounds ?? 'Not provided'} />
                <DetailCard label="Small Books" value={<span className="inline-flex items-center gap-2"><BookOpen size={16} className="text-sky-600" />{profile?.prabhupadaBooks.small}<BookInfo size="small" /></span>} />
                <DetailCard label="Medium Books" value={<span className="inline-flex items-center gap-2">{profile?.prabhupadaBooks.medium}<BookInfo size="medium" /></span>} />
                <DetailCard label="Big Books" value={<span className="inline-flex items-center gap-2">{profile?.prabhupadaBooks.big}<BookInfo size="big" /></span>} />
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
};

export default PatientProfile;
