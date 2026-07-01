
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAuth, RecaptchaVerifier, PhoneAuthProvider, multiFactor, PhoneMultiFactorGenerator, signOut } from 'firebase/auth';
import { UserRole } from '../types';

const EnforceMfaPage: React.FC = () => {
  const navigate = useNavigate();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCodeSent, setIsCodeSent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [requiresRecentLogin, setRequiresRecentLogin] = useState(false);

  const auth = getAuth();
  const user = auth.currentUser;
  const verifierRef = useRef<RecaptchaVerifier | null>(null);
  const recaptchaContainerIdRef = useRef(`recaptcha-container-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    if (!import.meta.env.PROD) {
      navigate('/dashboard', { replace: true });
      return;
    }
    return () => {
      try {
        verifierRef.current?.clear();
      } catch {
        // ignore
      }
      verifierRef.current = null;
    };
  }, []);

  const setupRecaptcha = async (): Promise<RecaptchaVerifier> => {
    if (verifierRef.current) return verifierRef.current;

    const container = document.getElementById(recaptchaContainerIdRef.current);
    if (!container) {
      throw new Error('reCAPTCHA container not found.');
    }

    container.innerHTML = '';

    const verifier = new RecaptchaVerifier(auth, container, {
      size: 'invisible',
      callback: () => { /* reCAPTCHA solved */ },
    });

    await verifier.render();
    verifierRef.current = verifier;
    return verifier;
  };

  const handleSendCode = async () => {
    setError(null);
    setRequiresRecentLogin(false);
    setIsSubmitting(true);
    if (!user) {
      setError('You must be logged in to set up MFA.');
      setIsSubmitting(false);
      return;
    }

    if (!phoneNumber.trim().startsWith('+')) {
      setError('Use E.164 format, e.g. +919948434604');
      setIsSubmitting(false);
      return;
    }

    try {
      const appVerifier = await setupRecaptcha();
      const multiFactorSession = await multiFactor(user).getSession();
      const phoneInfoOptions = {
        phoneNumber,
        session: multiFactorSession,
      };

      const phoneAuthProvider = new PhoneAuthProvider(auth);
      const newVerificationId = await phoneAuthProvider.verifyPhoneNumber(
        phoneInfoOptions,
        appVerifier
      );
      
      setVerificationId(newVerificationId);
      setIsCodeSent(true);
    } catch (error: any) {
      if (error?.code === 'auth/requires-recent-login') {
        setRequiresRecentLogin(true);
        setError('For security, please sign in again to enable two-factor authentication.');
      } else {
        setError(`Failed to send verification code: ${error.message}`);
      }
      // Recreate verifier for retry.
      try {
        verifierRef.current?.clear();
      } catch {
        // ignore
      }
      verifierRef.current = null;
      const container = document.getElementById(recaptchaContainerIdRef.current);
      if (container) container.innerHTML = '';
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyCode = async () => {
    setError(null);
    setRequiresRecentLogin(false);
    setIsSubmitting(true);
    if (!verificationId || !user) {
      setError('Verification process not started or user not logged in.');
      setIsSubmitting(false);
      return;
    }

    try {
      const cred = PhoneAuthProvider.credential(verificationId, verificationCode);
      const multiFactorAssertion = PhoneMultiFactorGenerator.assertion(cred);
      await multiFactor(user).enroll(multiFactorAssertion, `My Phone Number`);

      // MFA is now enabled!
      // Redirect to the dashboard or original destination.
      navigate('/dashboard'); 

    } catch (error: any) {
      if (error?.code === 'auth/requires-recent-login') {
        setRequiresRecentLogin(true);
        setError('For security, please sign in again to enable two-factor authentication.');
      } else {
        setError(`Failed to verify code: ${error.message}`);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReauth = async () => {
    try {
      await signOut(auth);
    } finally {
      navigate('/stafflogin', {
        replace: true,
        state: {
          from: '/enforce-mfa',
          preferredRole: UserRole.ADMIN,
          message: 'Please sign in again to continue MFA setup.',
        },
      });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="max-w-md w-full bg-white p-8 rounded-lg shadow-md">
        <h2 className="text-2xl font-bold text-center text-gray-800 mb-4">
          Enable Two-Factor Authentication
        </h2>
        <p className="text-center text-gray-600 mb-6">
          For added security, you must enable two-factor authentication to continue.
        </p>

        {!isCodeSent ? (
          // Step 1: Enter Phone Number
          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-gray-700">Phone Number</label>
            <input
              type="tel"
              id="phone"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="+1 650-555-3434"
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            />
            <button
              onClick={handleSendCode}
              disabled={isSubmitting}
              className="w-full mt-4 flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              {isSubmitting ? 'Sending...' : 'Send Verification Code'}
            </button>
          </div>
        ) : (
          // Step 2: Enter Verification Code
          <div>
            <p className="text-sm text-center text-gray-600 mb-4">
              A verification code has been sent to {phoneNumber}.
            </p>
            <label htmlFor="code" className="block text-sm font-medium text-gray-700">Verification Code</label>
            <input
              type="text"
              id="code"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value)}
              placeholder="Enter 6-digit code"
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            />
            <button
              onClick={handleVerifyCode}
              disabled={isSubmitting}
              className="w-full mt-4 flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              {isSubmitting ? 'Verifying...' : 'Verify and Enable MFA'}
            </button>
          </div>
        )}

        {error && <p className="mt-4 text-sm text-red-600 text-center">{error}</p>}
        {requiresRecentLogin && (
          <button
            onClick={handleReauth}
            className="w-full mt-3 flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            Sign in again
          </button>
        )}

        {/* This div is used by reCAPTCHA */}
        <div id={recaptchaContainerIdRef.current} className="mt-4"></div>
      </div>
    </div>
  );
};

export default EnforceMfaPage;
