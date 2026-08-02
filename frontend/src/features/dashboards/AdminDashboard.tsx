'use client';

import React from 'react';
import { Calendar, Heart, Search, Users, Wallet } from 'lucide-react';

import { getAdminDashboardSummary, type AdminDashboardSummary } from '../../services/clinicService';
import { Appointment, User } from '../../types';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);

const statusPresentation = (appointment: Appointment) => {
  const value = appointment.paymentStatus || appointment.status;
  const normalized = value.toLowerCase();
  if (normalized === 'confirmed') return { label: 'Paid', classes: 'bg-green-100 text-green-700' };
  if (normalized === 'completed') return { label: 'Completed', classes: 'bg-sky-100 text-sky-700' };
  if (normalized === 'cancelled' || normalized === 'failed') {
    return { label: value, classes: 'bg-red-100 text-red-700' };
  }
  return { label: value, classes: 'bg-amber-100 text-amber-700' };
};

const AdminDashboard: React.FC<{ user: User }> = ({ user }) => {
  const [summary, setSummary] = React.useState<AdminDashboardSummary | null>(null);
  const [search, setSearch] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  const loadSummary = React.useCallback(async () => {
    try {
      const nextSummary = await getAdminDashboardSummary();
      setSummary(nextSummary);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load the live clinic overview.');
    }
  }, []);

  React.useEffect(() => {
    void loadSummary();
    const refreshTimer = window.setInterval(() => void loadSummary(), 30_000);
    return () => window.clearInterval(refreshTimer);
  }, [loadSummary]);

  const recentAppointments = React.useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return summary?.recentAppointments ?? [];
    return (summary?.recentAppointments ?? []).filter((appointment) => {
      const searchableValues = [
        appointment.patientName,
        appointment.doctorName,
        appointment.department,
        appointment.paymentStatus,
        appointment.status,
      ];
      return searchableValues.some((value) => value?.toLowerCase().includes(query));
    });
  }, [search, summary]);

  const stats = [
    { label: 'Total Patients', value: summary?.totalPatients, icon: <Users />, color: 'bg-sky-50 text-sky-600' },
    { label: 'Appointments Today', value: summary?.appointmentsToday, icon: <Calendar />, color: 'bg-amber-50 text-amber-600' },
    { label: 'Active Doctors', value: summary?.activeDoctors, icon: <Heart />, color: 'bg-red-50 text-red-600' },
    {
      label: 'Collected Revenue',
      value: summary ? formatCurrency(summary.grossRevenue) : undefined,
      icon: <Wallet />,
      color: 'bg-green-50 text-green-600',
    },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-10 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900">Welcome, {user.name}</h1>
          <p className="text-gray-500">Live clinic overview</p>
        </div>
        <div className="text-xs font-semibold text-gray-400">
          {summary ? `Updated ${new Date(summary.updatedAt).toLocaleTimeString()}` : 'Loading live data…'}
        </div>
      </div>

      {error && (
        <div className="mb-6 flex items-center justify-between gap-4 rounded-2xl border border-red-100 bg-red-50 px-5 py-4 text-sm text-red-700">
          <span>{error}</span>
          <button type="button" onClick={() => void loadSummary()} className="font-bold hover:text-red-900">
            Retry
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
            <div className={`w-12 h-12 ${stat.color} rounded-2xl flex items-center justify-center mb-4`}>
              {React.cloneElement(stat.icon, { size: 24 })}
            </div>
            <p className="text-sm text-gray-500 font-bold mb-1">{stat.label}</p>
            <p className="text-2xl font-black text-gray-900">{stat.value ?? '—'}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-8 py-6 border-b border-gray-100 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="font-bold text-gray-900">Recent Appointments</h3>
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <label htmlFor="appointment-search" className="sr-only">Search recent appointments</label>
                <input
                  id="appointment-search"
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search patient or doctor…"
                  className="w-full pl-10 pr-4 py-2 bg-gray-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-sky-500 sm:w-64"
                />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-8 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Patient</th>
                    <th className="px-8 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Doctor</th>
                    <th className="px-8 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Fee</th>
                    <th className="px-8 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {recentAppointments.map((appointment) => {
                    const presentation = statusPresentation(appointment);
                    return (
                      <tr key={appointment.id} className="hover:bg-gray-50 transition">
                        <td className="px-8 py-5 font-bold text-gray-900">{appointment.patientName}</td>
                        <td className="px-8 py-5 text-sm text-gray-500">{appointment.doctorName}</td>
                        <td className="px-8 py-5 text-sm font-bold text-sky-600">{formatCurrency(appointment.fee)}</td>
                        <td className="px-8 py-5">
                          <span className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider ${presentation.classes}`}>
                            {presentation.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {summary && recentAppointments.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-8 py-10 text-center text-sm text-gray-400">
                        {search ? 'No recent appointments match your search.' : 'No appointments have been recorded yet.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div>
          <div className="bg-gray-900 rounded-[2rem] p-8 text-white shadow-xl">
            <h3 className="font-bold mb-6">Live Activity</h3>
            <div className="space-y-6">
              <div className="p-4 bg-gray-800 rounded-2xl">
                <p className="text-xs text-gray-400 uppercase font-bold mb-1">Appointments This Week</p>
                <p className="text-xl font-black">{summary?.currentWeekAppointments ?? '—'}</p>
              </div>
              <div className="p-4 bg-gray-800 rounded-2xl">
                <p className="text-xs text-gray-400 uppercase font-bold mb-1">Completed Today</p>
                <p className="text-xl font-black">{summary?.completedToday ?? '—'}</p>
              </div>
              <div className="p-4 bg-sky-600 rounded-2xl">
                <p className="text-xs text-white/70 uppercase font-bold mb-1">Weekly Appointment Growth</p>
                <p className="text-xl font-black">
                  {summary ? `${summary.weeklyGrowthPercent > 0 ? '+' : ''}${summary.weeklyGrowthPercent}%` : '—'}
                </p>
                <p className="mt-1 text-xs text-white/70">Compared with the previous seven days</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
