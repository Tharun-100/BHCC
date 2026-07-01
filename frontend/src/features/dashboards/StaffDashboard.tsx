import React from 'react';
import Link from 'next/link';
import { User } from '@/types';
import { Briefcase, ClipboardList, UserCircle } from 'lucide-react';

const StaffDashboard: React.FC<{ user: User }> = ({ user }) => (
  <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
    <div className="mb-10">
      <h1 className="text-3xl font-extrabold text-gray-900">Welcome, {user.name}</h1>
      <p className="text-gray-500">{user.staffType || user.patientProfile?.profession || 'Staff'} portal</p>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      <Link href="/dashboard/profile" className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm hover:shadow-md transition">
        <div className="w-12 h-12 bg-sky-50 text-sky-600 rounded-2xl flex items-center justify-center mb-5">
          <UserCircle size={24} />
        </div>
        <h2 className="text-xl font-black text-gray-900 mb-2">My Profile</h2>
        <p className="text-gray-500">View and update your staff profile and spiritual life details.</p>
      </Link>

      <div className="bg-gray-900 p-8 rounded-[2.5rem] text-white shadow-xl">
        <div className="w-12 h-12 bg-white/10 text-sky-300 rounded-2xl flex items-center justify-center mb-5">
          <ClipboardList size={24} />
        </div>
        <h2 className="text-xl font-black mb-2">Assigned Work</h2>
        <p className="text-gray-300">Please follow your department instructions and contact Admin for role or salary updates.</p>
        <div className="mt-6 p-4 bg-white/10 rounded-2xl flex items-center">
          <Briefcase size={18} className="mr-2 text-sky-300" />
          <span className="font-bold">{user.patientProfile?.profession || user.staffType || 'Staff'}</span>
        </div>
      </div>
    </div>
  </div>
);

export default StaffDashboard;
