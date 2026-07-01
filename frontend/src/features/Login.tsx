import React, { useState, useEffect } from 'react';
import { PatientRegistrationPayload, UserRole } from '../types';
import { User as UserIcon, Mail, Lock, Loader2, Chrome, MapPin, Phone, Briefcase, Heart, Info } from 'lucide-react';
import { CLINIC_NAME, PRABHUPADA_BOOK_LISTS } from '../constants';
import { loginWithEmail, loginWithGoogle, logoutUser, registerPatientWithEmail, requestPasswordReset } from '../services/authService';
import { useAuth } from '@/providers/AuthProvider';
import { useRouter, useSearchParams } from 'next/navigation';

const emptyRegistrationForm: PatientRegistrationPayload = {
  name: '',
  email: '',
  password: '',
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

const incomeRanges = ['Less than 1 lakh', '1-5 Lakhs', 'Greater than 5 Lakhs'];
const bookStatuses = ['Yet to Start', 'Just Started', 'Ongoing', 'Completed'];
const religions = ['Hindu', 'Muslim', 'Christian', 'Others'];
const spiritualFieldsDisabledFor = ['muslim', 'christian'];
type BookSize = keyof typeof PRABHUPADA_BOOK_LISTS;

const BookInfo = ({ size }: { size: BookSize }) => (
  <details className="relative inline-block group">
    <summary className="list-none cursor-pointer inline-flex items-center justify-center w-5 h-5 rounded-full bg-sky-100 text-sky-700 hover:bg-sky-200">
      <Info size={13} />
    </summary>
    <div className="absolute z-30 left-0 mt-2 w-72 max-h-72 overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl border border-sky-100 text-left">
      <p className="text-xs font-black uppercase tracking-widest text-sky-700 mb-3">{size} books</p>
      <ul className="space-y-2">
        {PRABHUPADA_BOOK_LISTS[size].map((book) => (
          <li key={book} className="text-xs font-semibold text-gray-700 leading-snug">• {book}</li>
        ))}
      </ul>
    </div>
  </details>
);

const Login: React.FC = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setUser } = useAuth();

  const from = searchParams?.get('next') || '/dashboard';
  const redirectMessage = searchParams?.get('message') || undefined;

  const [isRegistering, setIsRegistering] = useState(false);
  const [isResetMode, setIsResetMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [formData, setFormData] = useState<PatientRegistrationPayload>(emptyRegistrationForm);
  const selectedReligion = formData.religion.trim().toLowerCase();
  const hasSelectedReligion = Boolean(selectedReligion);
  const canShowSpiritualFields = hasSelectedReligion && !spiritualFieldsDisabledFor.includes(selectedReligion);

  useEffect(() => {
    if (redirectMessage) {
      setSuccessMessage(redirectMessage);
    }
  }, [redirectMessage]);

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (!formData.email.trim()) {
      setError('Please enter your account email first.');
      return;
    }

    setIsLoading(true);
    try {
      await requestPasswordReset(formData.email);
      setSuccessMessage('Password reset link sent. Please check your email inbox.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send reset email.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();

    setError(null);
    setSuccessMessage(null);
    setIsLoading(true);

    try {
      const nextUser = isRegistering
        ? await registerPatientWithEmail({
            ...formData,
            name: formData.name.trim(),
            email: formData.email.trim(),
            address: formData.address.trim(),
            phoneNo: formData.phoneNo.trim(),
            profession: formData.profession.trim(),
            religion: formData.religion.trim(),
            hasChildren: formData.isMarried ? formData.hasChildren : false,
            iskconVisitFrequency: canShowSpiritualFields ? formData.iskconVisitFrequency.trim() : '',
            iskconVisited: canShowSpiritualFields ? formData.iskconVisited : false,
            chantsHareKrishna: canShowSpiritualFields ? formData.chantsHareKrishna : false,
            mahamantraRounds: canShowSpiritualFields ? formData.mahamantraRounds : null,
            prabhupadaBooks: canShowSpiritualFields ? formData.prabhupadaBooks : { small: '', medium: '', big: '' }
          })
        : await loginWithEmail(formData.email.trim(), formData.password);

      if (nextUser.role !== UserRole.PATIENT) {
        await logoutUser();
        setError('This is a staff account. Please sign in via Staff Login.');
        router.replace(`/stafflogin?next=${encodeURIComponent(from)}`);
        return;
      }

      setUser(nextUser);
      router.replace(from);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError(null);
    setSuccessMessage(null);
    setIsLoading(true);

    try {
      const nextUser = await loginWithGoogle();

      if (nextUser.role !== UserRole.PATIENT) {
        await logoutUser();
        setError('This is a staff account. Please sign in via Staff Login.');
        router.replace(`/stafflogin?next=${encodeURIComponent(from)}`);
        return;
      }

      setUser(nextUser);
      router.replace(from);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google authentication failed.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-soft-gradient flex items-center justify-center py-12 px-4 animate-in slide-in-from-bottom-4 duration-500">
      <div className={`${isRegistering ? 'max-w-4xl' : 'max-w-md'} w-full bg-white rounded-[2.5rem] shadow-2xl shadow-sky-100 p-8 lg:p-12 border border-gray-100 relative overflow-hidden`}>
        <div className="absolute -top-12 -right-12 w-40 h-40 bg-sky-50 rounded-full opacity-50"></div>

        <div className="relative z-10 flex items-center justify-between mb-8">
          <div className="flex items-center text-sky-600 font-bold text-base">
            <img src="/bhcc-logo.png" alt={CLINIC_NAME} className="w-12 h-12 mr-3 object-contain shrink-0" /> Patient Portal
          </div>
        </div>

        <div className="relative z-10 text-center mb-10">
          <h2 className="text-3xl font-black text-gray-900 mb-2">{isRegistering ? 'Create Account' : 'Welcome Back'}</h2>
          <p className="text-gray-500 text-sm font-medium uppercase tracking-wider">PATIENT LOGIN</p>
        </div>

        <div className="space-y-6 relative z-10">
          {error && (
            <div className="bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-2xl text-sm font-bold animate-in fade-in slide-in-from-top-2 duration-300">
              {error}
            </div>
          )}
          {successMessage && (
            <div className="bg-green-50 border border-green-100 text-green-700 px-4 py-3 rounded-2xl text-sm font-bold">
              {successMessage}
            </div>
          )}

          {!isResetMode && (
            <button
              onClick={handleGoogleLogin}
              disabled={isLoading}
              className="w-full flex items-center justify-center space-x-3 py-4 border-2 border-gray-100 rounded-2xl font-bold text-gray-700 hover:bg-gray-50 hover:border-sky-200 transition-all disabled:opacity-50"
            >
              {isLoading ? <Loader2 className="animate-spin text-sky-600" size={20} /> : <Chrome className="text-sky-600" size={20} />}
              <span>{isRegistering ? 'Sign up with Google' : 'Continue with Google'}</span>
            </button>
          )}

          {!isResetMode && (
            <div className="flex items-center space-x-4">
              <div className="flex-grow h-px bg-gray-100"></div>
              <span className="text-xs font-bold text-gray-300 uppercase tracking-widest">Or use email</span>
              <div className="flex-grow h-px bg-gray-100"></div>
            </div>
          )}

          <form onSubmit={isResetMode ? handlePasswordReset : handleAuth} className="space-y-4">
            {isRegistering && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Full Name</label>
                  <div className="relative group">
                    <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-sky-500 transition-colors" size={20} />
                    <input
                      required
                      type="text"
                      placeholder="Enter your name"
                      className="w-full pl-12 pr-4 py-4 bg-gray-50 border-2 border-transparent rounded-2xl focus:bg-white focus:border-sky-500 transition-all focus:ring-0 text-gray-900"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Email Address</label>
              <div className="relative group">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-sky-500 transition-colors" size={20} />
                <input
                  required
                  type="email"
                  placeholder="name@example.com"
                  className="w-full pl-12 pr-4 py-4 bg-gray-50 border-2 border-transparent rounded-2xl focus:bg-white focus:border-sky-500 transition-all focus:ring-0 text-gray-900"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
            </div>

            {!isResetMode && (
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Password</label>
                <div className="relative group">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-sky-500 transition-colors" size={20} />
                  <input
                    required
                    type="password"
                    placeholder="********"
                    className="w-full pl-12 pr-4 py-4 bg-gray-50 border-2 border-transparent rounded-2xl focus:bg-white focus:border-sky-500 transition-all focus:ring-0 text-gray-900"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  />
                </div>
              </div>
            )}

            {isRegistering && !isResetMode && (
              <div className="pt-4 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Address</label>
                    <div className="relative group">
                      <MapPin className="absolute left-4 top-4 text-gray-300 group-focus-within:text-sky-500 transition-colors" size={20} />
                      <textarea
                        required
                        rows={3}
                        placeholder="Enter full address"
                        className="w-full pl-12 pr-4 py-4 bg-gray-50 border-2 border-transparent rounded-2xl focus:bg-white focus:border-sky-500 transition-all focus:ring-0 text-gray-900"
                        value={formData.address}
                        onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Phone No</label>
                    <div className="relative group">
                      <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-sky-500 transition-colors" size={20} />
                      <input
                        required
                        type="tel"
                        placeholder="Enter phone number"
                        className="w-full pl-12 pr-4 py-4 bg-gray-50 border-2 border-transparent rounded-2xl focus:bg-white focus:border-sky-500 transition-all focus:ring-0 text-gray-900"
                        value={formData.phoneNo}
                        onChange={(e) => setFormData({ ...formData, phoneNo: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Profession</label>
                    <div className="relative group">
                      <Briefcase className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-sky-500 transition-colors" size={20} />
                      <input
                        required
                        type="text"
                        placeholder="Profession"
                        className="w-full pl-12 pr-4 py-4 bg-gray-50 border-2 border-transparent rounded-2xl focus:bg-white focus:border-sky-500 transition-all focus:ring-0 text-gray-900"
                        value={formData.profession}
                        onChange={(e) => setFormData({ ...formData, profession: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Married</label>
                    <div className="grid grid-cols-2 gap-3">
                      {[true, false].map((value) => (
                        <button
                          key={String(value)}
                          type="button"
                          onClick={() => setFormData({ ...formData, isMarried: value, hasChildren: value ? formData.hasChildren : false })}
                          className={`py-4 rounded-2xl border-2 font-bold transition ${formData.isMarried === value ? 'border-sky-500 bg-sky-50 text-sky-700' : 'border-gray-100 bg-gray-50 text-gray-500'}`}
                        >
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
                          <button
                            key={String(value)}
                            type="button"
                            onClick={() => setFormData({ ...formData, hasChildren: value })}
                            className={`py-4 rounded-2xl border-2 font-bold transition ${formData.hasChildren === value ? 'border-sky-500 bg-sky-50 text-sky-700' : 'border-gray-100 bg-gray-50 text-gray-500'}`}
                          >
                            {value ? 'Yes' : 'No'}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Annual Income</label>
                    <select
                      required
                      className="w-full px-4 py-4 bg-gray-50 border-2 border-transparent rounded-2xl focus:bg-white focus:border-sky-500 transition-all focus:ring-0 text-gray-900"
                      value={formData.annualIncomeRange}
                      onChange={(e) => setFormData({ ...formData, annualIncomeRange: e.target.value })}
                    >
                      <option value="">Select range</option>
                      {incomeRanges.map((range) => <option key={range} value={range}>{range}</option>)}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Religion</label>
                    <select
                      required
                      className="w-full px-4 py-4 bg-gray-50 border-2 border-transparent rounded-2xl focus:bg-white focus:border-sky-500 transition-all focus:ring-0 text-gray-900"
                      value={formData.religion}
                      onChange={(e) => setFormData({ ...formData, religion: e.target.value })}
                    >
                      <option value="">Select religion</option>
                      {religions.map((religion) => <option key={religion} value={religion}>{religion}</option>)}
                    </select>
                  </div>
                </div>

                {canShowSpiritualFields ? (
                  <div className="bg-sky-50/70 rounded-3xl p-5 border border-sky-100 space-y-4">
                    <div className="flex items-center text-sky-900 font-black">
                      <Heart size={18} className="mr-2 text-sky-600" /> ISKCON & Spiritual Reading
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <label className="flex items-center justify-between p-4 bg-white rounded-2xl border border-sky-100 font-bold text-gray-700">
                        Visited ISKCON temple?
                        <input
                          type="checkbox"
                          checked={formData.iskconVisited}
                          onChange={(e) => setFormData({ ...formData, iskconVisited: e.target.checked })}
                          className="w-5 h-5"
                        />
                      </label>
                      {formData.iskconVisited && (
                        <input
                          type="text"
                          placeholder="How frequently do you visit?"
                          className="w-full px-4 py-4 bg-white border-2 border-transparent rounded-2xl focus:border-sky-500 transition-all text-gray-900"
                          value={formData.iskconVisitFrequency}
                          onChange={(e) => setFormData({ ...formData, iskconVisitFrequency: e.target.value })}
                        />
                      )}
                      <label className="flex items-center justify-between p-4 bg-white rounded-2xl border border-sky-100 font-bold text-gray-700">
                        Chant Hare Krishna daily?
                        <input
                          type="checkbox"
                          checked={formData.chantsHareKrishna}
                          onChange={(e) => setFormData({ ...formData, chantsHareKrishna: e.target.checked })}
                          className="w-5 h-5"
                        />
                      </label>
                      {formData.chantsHareKrishna && (
                        <input
                          type="number"
                          min={0}
                          placeholder="How many rounds?"
                          className="w-full px-4 py-4 bg-white border-2 border-transparent rounded-2xl focus:border-sky-500 transition-all text-gray-900"
                          value={formData.mahamantraRounds ?? ''}
                          onChange={(e) => setFormData({ ...formData, mahamantraRounds: e.target.value ? Number(e.target.value) : null })}
                        />
                      )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {(['small', 'medium', 'big'] as const).map((size) => (
                        <div key={size} className="space-y-2">
                          <div className="flex items-center gap-2 ml-1">
                            <label className="text-xs font-bold text-sky-700 uppercase tracking-widest">{size} books</label>
                            <BookInfo size={size} />
                          </div>
                          <select
                            className="w-full px-4 py-4 bg-white border-2 border-transparent rounded-2xl focus:border-sky-500 transition-all text-gray-900"
                            value={formData.prabhupadaBooks[size]}
                            onChange={(e) => setFormData({
                              ...formData,
                              prabhupadaBooks: { ...formData.prabhupadaBooks, [size]: e.target.value }
                            })}
                          >
                            <option value="">Select status</option>
                            {bookStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-4 bg-sky-600 text-white rounded-2xl font-black text-lg hover:bg-sky-700 transition shadow-xl shadow-sky-100 flex items-center justify-center space-x-3 disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <Loader2 className="animate-spin" size={20} />
                  <span>Please wait...</span>
                </>
              ) : (
                <span>
                  {isResetMode ? 'Send Reset Link' : isRegistering ? 'Create Account' : 'Sign In'}
                </span>
              )}
            </button>
          </form>

          {!isResetMode ? (
            <div className="text-center pt-4">
              <p className="text-sm text-gray-500">
                {isRegistering ? 'Already have an account?' : "Don't have an account?"}{' '}
                <button onClick={() => setIsRegistering(!isRegistering)} className="text-sky-600 font-bold hover:underline">
                  {isRegistering ? 'Sign In' : 'Register Now'}
                </button>
              </p>
            </div>
          ) : null}

          {!isRegistering && (
            <div className="text-center">
              {!isResetMode ? (
                <button
                  onClick={() => {
                    setIsResetMode(true);
                    setError(null);
                    setSuccessMessage(null);
                  }}
                  className="text-sm text-sky-600 font-bold hover:underline"
                >
                  Forgot Password?
                </button>
              ) : (
                <button
                  onClick={() => {
                    setIsResetMode(false);
                    setError(null);
                    setSuccessMessage(null);
                  }}
                  className="text-sm text-gray-500 font-bold hover:text-sky-600"
                >
                  Back to Sign In
                </button>
              )}
            </div>
          )}

          <div className="pt-8 text-right">
            <button
              onClick={() => router.push(`/stafflogin?next=${encodeURIComponent(from)}`)}
              className="text-xs font-semibold text-gray-300 hover:text-sky-600 transition-colors"
            >
              Staff access
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
