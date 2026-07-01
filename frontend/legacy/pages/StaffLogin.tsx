import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Chrome,
  Loader2,
  Lock,
  Mail,
  PlusCircle,
  Shield,
  Stethoscope,
} from 'lucide-react';
import { User, UserRole } from '../types';
import { CLINIC_NAME } from '../constants';
import { loginWithEmail, loginWithGoogle, logoutUser, requestPasswordReset } from '../services/authService';

interface StaffLoginProps {
  onLogin: (user: User) => void;
}

const StaffLogin: React.FC<StaffLoginProps> = ({ onLogin }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const from = location.state?.from || '/dashboard';
  const redirectMessage = location.state?.message as string | undefined;

  const preferredRoleRaw = location.state?.preferredRole as UserRole | undefined;
  const preferredRole = useMemo(() => {
    if (preferredRoleRaw === UserRole.DOCTOR) return UserRole.DOCTOR;
    if (preferredRoleRaw === UserRole.ADMIN) return UserRole.ADMIN;
    if (preferredRoleRaw === UserRole.COUNTER) return UserRole.COUNTER;
    return null;
  }, [preferredRoleRaw]);

  const [selectedRole, setSelectedRole] = useState<UserRole | null>(preferredRole);
  const [isResetMode, setIsResetMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [formData, setFormData] = useState({ email: '', password: '' });

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
      const nextUser = await loginWithEmail(formData.email.trim(), formData.password);

      if (nextUser.role === UserRole.PATIENT) {
        await logoutUser();
        setError('This is the Staff Portal. Please sign in via Patient Login.');
        navigate('/login', { replace: true });
        return;
      }

      onLogin(nextUser);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (!selectedRole) return;

    setError(null);
    setSuccessMessage(null);
    setIsLoading(true);

    try {
      const nextUser = await loginWithGoogle();

      if (nextUser.role === UserRole.PATIENT) {
        await logoutUser();
        setError('This is the Staff Portal. Please sign in via Patient Login.');
        navigate('/login', { replace: true });
        return;
      }

      onLogin(nextUser);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google authentication failed.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!selectedRole) {
    return (
      <div className="min-h-screen bg-soft-gradient flex items-center justify-center py-12 px-4 animate-in fade-in duration-500">
        <div className="max-w-4xl w-full">
          <div className="text-center mb-10">
            <div className="w-16 h-16 bg-sky-600 text-white rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-xl shadow-sky-200">
              <img src="/bhcc-logo.png" alt={CLINIC_NAME} className="w-12 h-12 object-contain" />
            </div>
            <h2 className="text-4xl font-black text-gray-900 tracking-tight">Staff Portal</h2>
            <p className="text-gray-500 mt-3 text-lg">Select your staff role to continue</p>
            <button
              onClick={() => navigate('/login')}
              className="mt-6 inline-flex items-center text-sm font-bold text-sky-600 hover:underline"
            >
              Patient Login <ArrowLeft size={16} className="ml-2 rotate-180" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
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
            </div>
          )}

          {!isResetMode && (
            <button
              onClick={handleGoogleLogin}
              disabled={isLoading}
              className="w-full flex items-center justify-center space-x-3 py-4 border-2 border-gray-100 rounded-2xl font-bold text-gray-700 hover:bg-gray-50 hover:border-sky-200 transition-all disabled:opacity-50"
            >
              {isLoading ? <Loader2 className="animate-spin text-sky-600" size={20} /> : <Chrome className="text-sky-600" size={20} />}
              <span>Continue with Google</span>
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
                <span>{isResetMode ? 'Send Reset Link' : 'Sign In'}</span>
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
            <button onClick={() => navigate('/login')} className="text-xs text-gray-500 font-semibold hover:text-sky-600">
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
