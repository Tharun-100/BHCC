import React, { useState, useEffect } from 'react';
import { User, UserRole } from '../types';
import { useNavigate, useLocation } from 'react-router-dom';
import { User as UserIcon, Mail, Lock, ArrowLeft, Loader2, Chrome } from 'lucide-react';
import { CLINIC_NAME } from '../constants';
import { loginWithEmail, loginWithGoogle, logoutUser, registerPatientWithEmail, requestPasswordReset } from '../services/authService';

interface LoginProps {
  onLogin: (user: User) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const from = location.state?.from || '/dashboard';
  const redirectMessage = location.state?.message as string | undefined;

  const [isRegistering, setIsRegistering] = useState(false);
  const [isResetMode, setIsResetMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: '', email: '', password: '' });

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
        ? await registerPatientWithEmail(formData.name.trim(), formData.email.trim(), formData.password)
        : await loginWithEmail(formData.email.trim(), formData.password);

      if (nextUser.role !== UserRole.PATIENT) {
        await logoutUser();
        setError('This is a staff account. Please sign in via Staff Login.');
        navigate('/stafflogin', { replace: true });
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
    setError(null);
    setSuccessMessage(null);
    setIsLoading(true);

    try {
      const nextUser = await loginWithGoogle();

      if (nextUser.role !== UserRole.PATIENT) {
        await logoutUser();
        setError('This is a staff account. Please sign in via Staff Login.');
        navigate('/stafflogin', { replace: true });
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

  return (
    <div className="min-h-screen bg-soft-gradient flex items-center justify-center py-12 px-4 animate-in slide-in-from-bottom-4 duration-500">
      <div className="max-w-md w-full bg-white rounded-[2.5rem] shadow-2xl shadow-sky-100 p-8 lg:p-12 border border-gray-100 relative overflow-hidden">
        <div className="absolute -top-12 -right-12 w-40 h-40 bg-sky-50 rounded-full opacity-50"></div>

        <div className="relative z-10 flex items-center justify-between mb-8">
          <div className="flex items-center text-sky-600 font-bold text-sm">
            <img src="/bhcc-logo.png" alt={CLINIC_NAME} className="w-5 h-5 mr-2 object-contain" /> Patient Portal
          </div>
          <button
            onClick={() => navigate('/stafflogin')}
            className="flex items-center text-gray-400 hover:text-sky-600 font-bold text-sm transition-colors"
          >
            Staff Login <ArrowLeft size={16} className="ml-2 rotate-180" />
          </button>
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
        </div>
      </div>
    </div>
  );
};

export default Login;
