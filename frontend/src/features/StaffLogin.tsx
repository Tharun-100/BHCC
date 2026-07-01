import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Loader2,
  Lock,
  Mail,
  PlusCircle,
  Shield,
  Stethoscope,
} from 'lucide-react';
import { UserRole } from '../types';
import { CLINIC_NAME } from '../constants';
import { requestPasswordReset, requestStaffLoginOtp, verifyStaffLoginOtp } from '../services/authService';
import { useAuth } from '@/providers/AuthProvider';
import { useRouter, useSearchParams } from 'next/navigation';

const StaffLogin: React.FC = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setUser } = useAuth();

  const from = searchParams?.get('next') || '/dashboard';
  const redirectMessage = searchParams?.get('message') || undefined;

  const preferredRoleRaw = (searchParams?.get('role') as UserRole | null) || undefined;
  const preferredRole = useMemo(() => {
    if (preferredRoleRaw === UserRole.DOCTOR) return UserRole.DOCTOR;
    if (preferredRoleRaw === UserRole.ADMIN) return UserRole.ADMIN;
    if (preferredRoleRaw === UserRole.COUNTER) return UserRole.COUNTER;
    if (preferredRoleRaw === UserRole.STAFF) return UserRole.STAFF;
    return null;
  }, [preferredRoleRaw]);

  const [selectedRole, setSelectedRole] = useState<UserRole | null>(preferredRole);
  const [isResetMode, setIsResetMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [formData, setFormData] = useState({ email: '', password: '', otp: '' });
  const [otpChallengeId, setOtpChallengeId] = useState<string | null>(null);
  const [devOtp, setDevOtp] = useState<string | null>(null);

  useEffect(() => {
    if (preferredRole) setSelectedRole(preferredRole);
  }, [preferredRole]);

  useEffect(() => {
    if (redirectMessage) setSuccessMessage(redirectMessage);
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
    if (!selectedRole) return;

    setError(null);
    setSuccessMessage(null);
    setIsLoading(true);

    try {
      if (!otpChallengeId) {
        const otpStart = await requestStaffLoginOtp(formData.email.trim(), formData.password, selectedRole);
        if (otpStart.requiresOtp === false && otpStart.user) {
          setUser(otpStart.user);
          router.replace(from);
          return;
        }
        if (!otpStart.challengeId) {
          throw new Error('Could not start OTP verification.');
        }
        setOtpChallengeId(otpStart.challengeId);
        setDevOtp(otpStart.devOtp || null);
        setSuccessMessage(otpStart.otpSent ? 'OTP sent to your registered email.' : otpStart.detail || 'OTP generated for development login.');
        return;
      }

      const nextUser = await verifyStaffLoginOtp(otpChallengeId, formData.otp.trim());

      setUser(nextUser);
      router.replace(from);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!selectedRole) {
    return (
      <div className="min-h-screen bg-soft-gradient flex items-center justify-center py-12 px-4 animate-in fade-in duration-500">
        <div className="max-w-4xl w-full">
          <div className="text-center mb-10">
            <div className="w-24 h-24 bg-sky-600 text-white rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-xl shadow-sky-200">
              <img src="/bhcc-logo.png" alt={CLINIC_NAME} className="w-20 h-20 object-contain" />
            </div>
            <h2 className="text-4xl font-black text-gray-900 tracking-tight">Staff Portal</h2>
            <p className="text-gray-500 mt-3 text-lg">Select your staff role to continue</p>
            <button
              onClick={() => router.push(`/login?next=${encodeURIComponent(from)}`)}
              className="mt-6 inline-flex items-center text-sm font-bold text-sky-600 hover:underline"
            >
              Patient Login <ArrowLeft size={16} className="ml-2 rotate-180" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            <RoleCard
              icon={<Stethoscope size={32} />}
              role="Doctor Portal"
              desc="Manage your schedule and provide expert care."
              onClick={() => setSelectedRole(UserRole.DOCTOR)}
              color="text-amber-600"
              bgColor="bg-amber-50"
            />
            <RoleCard
              icon={<PlusCircle size={32} />}
              role="Counter Portal"
              desc="Lab registration, billing, and patient intake."
              onClick={() => setSelectedRole(UserRole.COUNTER)}
              color="text-purple-600"
              bgColor="bg-purple-50"
            />
            <RoleCard
              icon={<Shield size={32} />}
              role="Admin Panel"
              desc="Operational and financial controls."
              onClick={() => setSelectedRole(UserRole.ADMIN)}
              color="text-emerald-600"
              bgColor="bg-emerald-50"
            />
            <RoleCard
              icon={<Shield size={32} />}
              role="Staff Portal"
              desc="Receptionists, nurses, managers, cleaners, and general staff."
              onClick={() => setSelectedRole(UserRole.STAFF)}
              color="text-sky-600"
              bgColor="bg-sky-50"
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-soft-gradient flex items-center justify-center py-12 px-4 animate-in slide-in-from-bottom-4 duration-500">
      <div className="max-w-md w-full bg-white rounded-[2.5rem] shadow-2xl shadow-sky-100 p-8 lg:p-12 border border-gray-100 relative overflow-hidden">
        <div className="absolute -top-12 -right-12 w-40 h-40 bg-sky-50 rounded-full opacity-50"></div>

        {!preferredRole && (
          <button
            onClick={() => setSelectedRole(null)}
            className="relative z-10 flex items-center text-gray-400 hover:text-sky-600 font-bold text-sm mb-8 transition-colors"
          >
            <ArrowLeft size={16} className="mr-2" /> Back to Role Selection
          </button>
        )}

        <div className="relative z-10 text-center mb-10">
          <h2 className="text-3xl font-black text-gray-900 mb-2">Welcome Back</h2>
          <p className="text-gray-500 text-sm font-medium uppercase tracking-wider">{selectedRole} PORTAL</p>
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
              {devOtp && <div className="mt-2 text-sky-700">Development OTP: {devOtp}</div>}
            </div>
          )}

          {!isResetMode && (
            <div className="flex items-center space-x-4">
              <div className="flex-grow h-px bg-gray-100"></div>
              <span className="text-xs font-bold text-gray-300 uppercase tracking-widest">
                {otpChallengeId ? 'Enter email OTP' : selectedRole === UserRole.ADMIN ? 'Admin email OTP login' : 'Email password login'}
              </span>
              <div className="flex-grow h-px bg-gray-100"></div>
            </div>
          )}

          <form onSubmit={isResetMode ? handlePasswordReset : handleAuth} className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Email Address</label>
              <div className="relative group">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-sky-500 transition-colors" size={20} />
                <input
                  required
                  type="email"
                  placeholder="name@example.com"
                  readOnly={Boolean(otpChallengeId)}
                  className={`w-full pl-12 pr-4 py-4 border-2 border-transparent rounded-2xl transition-all focus:ring-0 text-gray-900 ${otpChallengeId ? 'bg-gray-100 cursor-not-allowed' : 'bg-gray-50 focus:bg-white focus:border-sky-500'}`}
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
                    readOnly={Boolean(otpChallengeId)}
                    className={`w-full pl-12 pr-4 py-4 border-2 border-transparent rounded-2xl transition-all focus:ring-0 text-gray-900 ${otpChallengeId ? 'bg-gray-100 cursor-not-allowed' : 'bg-gray-50 focus:bg-white focus:border-sky-500'}`}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  />
                </div>
              </div>
            )}

            {otpChallengeId && !isResetMode && (
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Email OTP</label>
                <input
                  required
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="Enter 6 digit OTP"
                  className="w-full px-4 py-4 bg-gray-50 border-2 border-transparent rounded-2xl focus:bg-white focus:border-sky-500 transition-all focus:ring-0 text-gray-900 tracking-[0.4em] text-center font-black"
                  value={formData.otp}
                  onChange={(e) => setFormData({ ...formData, otp: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                />
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
                <span>{isResetMode ? 'Send Reset Link' : otpChallengeId ? 'Verify OTP & Sign In' : selectedRole === UserRole.ADMIN ? 'Send OTP' : 'Sign In'}</span>
              )}
            </button>
          </form>

          <div className="text-center">
            {!isResetMode ? (
              <button
                onClick={() => {
                  setIsResetMode(true);
                  setError(null);
                  setSuccessMessage(null);
                  setOtpChallengeId(null);
                  setDevOtp(null);
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

          <div className="text-center pt-2">
            <button onClick={() => router.push(`/login?next=${encodeURIComponent(from)}`)} className="text-xs text-gray-500 font-semibold hover:text-sky-600">
              Patient Login
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

interface RoleCardProps {
  icon: React.ReactNode;
  role: string;
  desc: string;
  onClick: () => void;
  color?: string;
  bgColor?: string;
}

const RoleCard: React.FC<RoleCardProps> = ({
  icon,
  role,
  desc,
  onClick,
  color = 'text-sky-600',
  bgColor = 'bg-sky-50',
}) => (
  <button
    onClick={onClick}
    className="bg-white p-8 rounded-[2.5rem] border-2 border-gray-100 hover:border-sky-500 shadow-sm hover:shadow-2xl hover:shadow-sky-100 transition-all text-left group flex flex-col items-start"
  >
    <div
      className={`w-16 h-16 ${bgColor} ${color} rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300`}
    >
      {icon}
    </div>
    <h3 className="text-xl font-black text-gray-900 mb-2 group-hover:text-sky-600 transition-colors">{role}</h3>
    <p className="text-gray-500 text-sm leading-relaxed">{desc}</p>
    <div className="mt-8 flex items-center text-sky-600 font-bold text-sm">
      Enter Portal <ArrowLeft className="ml-2 rotate-180" size={16} />
    </div>
  </button>
);

export default StaffLogin;
