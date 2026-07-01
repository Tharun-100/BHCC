
import React from 'react';
import { User, Appointment } from '../../types';
import { Calendar, Clock, MapPin, FileText, UserCircle, Loader2, XCircle } from 'lucide-react';
import Link from 'next/link';
import { listPatientAppointments, updateAppointmentStatus } from '../../services/clinicService';
import { CLINIC_ADDRESS } from '@/constants';

const PatientDashboard: React.FC<{ user: User }> = ({ user }) => {
  const [appointments, setAppointments] = React.useState<Appointment[]>([]);
  const [cancellingAppointmentId, setCancellingAppointmentId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let mounted = true;
    const load = async () => {
      const rows = await listPatientAppointments(user.id);
      if (!mounted) return;
      setAppointments(rows);
    };
    load().catch(() => setAppointments([]));
    return () => {
      mounted = false;
    };
  }, [user.id]);

  const handleCancelAppointment = async (appointment: Appointment) => {
    const needsRefund = appointment.paymentStatus === 'Confirmed' && appointment.paymentId;
    const message = needsRefund
      ? 'Cancel this appointment? The refund will be sent back to the original payment source through the payment gateway.'
      : 'Cancel this appointment?';
    if (!window.confirm(message)) return;

    setCancellingAppointmentId(appointment.id);
    setError(null);
    try {
      const updatedAppointment = await updateAppointmentStatus(appointment.id, 'Cancelled');
      setAppointments((current) => current.map((item) => item.id === appointment.id ? updatedAppointment : item));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not cancel appointment.');
    } finally {
      setCancellingAppointmentId(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-10 space-y-4 md:space-y-0">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900">Welcome, {user.name}</h1>
          <p className="text-gray-500">Manage your in-clinic consultations.</p>
        </div>
        <Link href="/book" className="px-6 py-3 bg-sky-600 text-white rounded-xl font-bold hover:bg-sky-700 transition flex items-center justify-center">
          Book New Appointment
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center">
              <Calendar className="mr-2 text-sky-500" size={20} /> Scheduled Visits
            </h2>
            {error && <div className="mb-4 bg-red-50 border border-red-100 text-red-600 px-5 py-4 rounded-2xl text-sm font-bold">{error}</div>}
            <div className="space-y-4">
              {appointments.filter(a => a.status === 'Upcoming').map(app => (
                <div key={app.id} className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between group hover:shadow-md transition-shadow">
                  <div className="flex items-center space-x-6 mb-4 sm:mb-0">
                    <div className="w-16 h-16 bg-sky-50 rounded-2xl flex flex-col items-center justify-center text-sky-600">
                      <span className="text-[10px] font-bold uppercase">OCT</span>
                      <span className="text-xl font-black">24</span>
                    </div>
                    <div>
                      <h4 className="font-bold text-gray-900">{app.doctorName}</h4>
                      <p className="text-sm text-gray-500">{app.department}</p>
                      <div className="flex items-center text-xs text-sky-600 font-medium mt-1">
                        <Clock size={12} className="mr-1" /> {app.time} (Physical Visit)
                      </div>
                      {app.paymentStatus && <p className="text-xs text-gray-400 font-bold mt-1">Payment: {app.paymentStatus}</p>}
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <button className="px-4 py-2 bg-gray-50 text-gray-700 rounded-xl text-sm font-bold hover:bg-gray-100 flex items-center">
                      <MapPin size={14} className="mr-2" /> Directions
                    </button>
                    <button
                      onClick={() => handleCancelAppointment(app)}
                      disabled={cancellingAppointmentId === app.id}
                      className="px-4 py-2 bg-white border border-gray-100 text-red-500 rounded-xl text-sm font-bold hover:bg-red-50 disabled:opacity-60 flex items-center"
                    >
                      {cancellingAppointmentId === app.id ? <Loader2 size={14} className="mr-2 animate-spin" /> : <XCircle size={14} className="mr-2" />}
                      Cancel
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center">
              <FileText className="mr-2 text-sky-500" size={20} /> Past Consultations
            </h2>
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Doctor</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Date</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {appointments.filter(a => a.status !== 'Upcoming').map(app => (
                    <tr key={app.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 font-bold text-gray-900">{app.doctorName}</td>
                      <td className="px-6 py-4 text-sm text-gray-500">{app.date}</td>
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                          app.status === 'Cancelled' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                        }`}>
                          {app.status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {app.status === 'Cancelled' ? (
                          <span className="text-gray-500 text-sm font-bold">{app.paymentStatus || 'Cancelled'}</span>
                        ) : (
                          <button className="text-sky-600 font-bold text-sm hover:underline">Download Rx</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <div className="space-y-8">
          <Link href="/dashboard/profile" className="block bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm hover:shadow-md transition">
            <div className="flex items-center space-x-4 mb-5">
              <div className="w-12 h-12 bg-sky-50 rounded-2xl flex items-center justify-center text-sky-600">
                <UserCircle size={24} />
              </div>
              <div>
                <h3 className="font-black text-gray-900">My Profile</h3>
                <p className="text-sm text-gray-500">View your full registration details</p>
              </div>
            </div>
            <div className="text-sm text-gray-600 space-y-2">
              <p><span className="font-bold">Phone:</span> {user.patientProfile?.phoneNo || 'Not provided'}</p>
              <p><span className="font-bold">Address:</span> {user.patientProfile?.address || 'Not provided'}</p>
            </div>
          </Link>

          <div className="bg-gray-900 p-8 rounded-[2.5rem] text-white shadow-xl">
            <h3 className="font-bold mb-6 flex items-center">
               Clinic Info
            </h3>
            <div className="space-y-4 text-sm">
               <div className="flex items-start space-x-3">
                  <MapPin size={18} className="text-sky-500 shrink-0" />
                  <span>{CLINIC_ADDRESS}</span>
               </div>
               <div className="p-4 bg-gray-800 rounded-2xl">
                  <p className="text-xs text-gray-400 uppercase font-bold mb-1">Queue Policy</p>
                  <p className="text-xs">Please arrive 15 minutes prior to your slot for check-in.</p>
               </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PatientDashboard;
