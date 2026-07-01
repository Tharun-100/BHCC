import React from 'react';
import { useRouter } from 'next/navigation';

const EnforceMfaPage: React.FC = () => {
  const router = useRouter();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="max-w-md w-full bg-white p-8 rounded-lg shadow-md">
        <h2 className="text-2xl font-bold text-center text-gray-800 mb-4">Two-Factor Authentication</h2>
        <p className="text-center text-gray-600 mb-6">
          MFA was previously implemented via Firebase. In the BHCC stack (Django + PostgreSQL), MFA is not wired up
          yet.
        </p>
        <button
          onClick={() => router.push('/dashboard')}
          className="w-full flex justify-center py-2 px-4 rounded-md shadow-sm text-sm font-medium text-white bg-sky-600 hover:bg-sky-700"
        >
          Continue to Dashboard
        </button>
      </div>
    </div>
  );
};

export default EnforceMfaPage;
