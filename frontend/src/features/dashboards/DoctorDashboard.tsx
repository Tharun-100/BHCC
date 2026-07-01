
import React from 'react';
import { User, Appointment, WeekDayName } from '../../types';
import { Users, Calendar, DollarSign, CheckCircle, Clock, TrendingUp, MapPin } from 'lucide-react';
import { listDoctorAppointments } from '../../services/clinicService';

const formatDayWindows = (windows?: Array<{ start: string; end: string }>) => {
  if (!windows || windows.length === 0) return 'Off';
  return windows.map((window) => `${window.start}-${window.end}`).join(', ');
};

const DoctorDashboard: React.FC<{ user: User }> = ({ user }) => {
  const [appointments, setAppointments] = React.useState<Appointment[]>([]);

  React.useEffect(() => {
    let mounted = true;
    const load = async () => {
      const rows = await listDoctorAppointments(user.id);
      if (!mounted) return;
      setAppointments(rows);
    };
    load().catch(() => setAppointments([]));
    return () => {
      mounted = false;
    };
  }, [user.id]);

  const completed = appointments.filter(a => a.status === 'Completed');
  const upcoming = appointments.filter(a => a.status === 'Upcoming');
  const totalRevenue = completed.reduce((acc, curr) => acc + curr.fee, 0);
  const doctorEarnings = totalRevenue * 0.5;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-10">
        <h1 className="text-3xl font-extrabold text-gray-900">Welcome, {user.name}</h1>
        <p className="text-gray-500">Managing physical consultations at Bhaktivedanta.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
          <div className="w-12 h-12 bg-sky-50 text-sky-600 rounded-2xl flex items-center justify-center mb-4">
            <Users size={24} />
          </div>
          <p className="text-sm text-gray-500 font-bold mb-1">Total Patients</p>
          <p className="text-2xl font-black text-gray-900">1,248</p>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
          <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mb-4">
            <Clock size={24} />
          </div>
          <p className="text-sm text-gray-500 font-bold mb-1">Clinic Slots Today</p>
          <p className="text-2xl font-black text-gray-900">{upcoming.length} Pending</p>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
          <div className="w-12 h-12 bg-green-50 text-green-600 rounded-2xl flex items-center justify-center mb-4">
            <DollarSign size={24} />
          </div>
          <p className="text-sm text-gray-500 font-bold mb-1">Clinic Revenue (Share)</p>
          <p className="text-2xl font-black text-gray-900">₹{doctorEarnings}</p>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
          <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center mb-4">
            <CheckCircle size={24} />
          </div>
          <p className="text-sm text-gray-500 font-bold mb-1">Patient Satisfaction</p>
          <p className="text-2xl font-black text-gray-900">98%</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-8 py-6 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-bold text-gray-900">Queue Status</h3>
              <span className="text-xs font-bold text-sky-600 bg-sky-50 px-3 py-1 rounded-full flex items-center">
                 <MapPin size={12} className="mr-1" /> Main Wing
              </span>
            </div>
            <div className="divide-y divide-gray-100">
              {appointments.map(app => (
                <div key={app.id} className="px-8 py-6 flex flex-col sm:flex-row sm:items-center justify-between group hover:bg-gray-50 transition">
                  <div className="flex items-center space-x-6">
                    <div className="text-sky-600 font-black text-lg w-16">{app.time}</div>
                    <div>
                      <h4 className="font-bold text-gray-900">{app.patientName}</h4>
                      <p className="text-xs text-gray-500">In-Person Appointment</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3 mt-4 sm:mt-0">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${
                      app.status === 'Completed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {app.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div>
          <div className="bg-gray-900 rounded-3xl p-8 text-white shadow-xl">
            <h3 className="text-xl font-bold mb-8">Weekly Availability</h3>
            <div className="space-y-4">
              {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(day => {
                const windows = user.weeklySchedule?.[day as WeekDayName] || [];
                const isWorking = windows.length > 0;
                return (
                  <div key={day} className="flex items-start justify-between gap-4">
                    <span className={`text-sm ${isWorking ? 'text-white font-bold' : 'text-gray-600'}`}>{day}</span>
                    <span className={`text-xs px-2 py-1 rounded-lg text-right ${isWorking ? 'bg-sky-500/20 text-sky-400' : 'bg-gray-800 text-gray-700'}`}>
                      {formatDayWindows(windows)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DoctorDashboard;
