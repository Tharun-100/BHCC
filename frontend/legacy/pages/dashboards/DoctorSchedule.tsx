
import React, { useState } from 'react';
import { User, Appointment } from '../../types';
import { Calendar, MapPin, ChevronLeft, ChevronRight, CheckCircle } from 'lucide-react';
import DoctorAvailabilityManager from '../../components/DoctorAvailabilityManager';
import { listDoctorAppointments } from '../../services/clinicService';

const DoctorSchedule: React.FC<{ user: User }> = ({ user }) => {
  const [view, setView] = useState<'appointments' | 'availability'>('appointments');
  const [schedule, setSchedule] = useState<Appointment[]>([]);

  React.useEffect(() => {
    let mounted = true;
    const load = async () => {
      const rows = await listDoctorAppointments(user.id);
      if (!mounted) return;
      setSchedule(rows);
    };
    load().catch(() => setSchedule([]));
    return () => {
      mounted = false;
    };
  }, [user.id]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-10 gap-6">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900">{user.name}'s Schedule</h1>
          <p className="text-gray-500 font-medium">Manage your clinic hours and patient visits.</p>
        </div>
        
        <div className="flex items-center bg-gray-100 p-1 rounded-2xl">
          <button 
            onClick={() => setView('appointments')}
            className={`px-6 py-2 rounded-xl text-sm font-bold transition ${view === 'appointments' ? 'bg-white text-sky-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Appointments
          </button>
          <button 
            onClick={() => setView('availability')}
            className={`px-6 py-2 rounded-xl text-sm font-bold transition ${view === 'availability' ? 'bg-white text-sky-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Manage Availability
          </button>
        </div>
      </div>

      {view === 'appointments' ? (
        <>
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
            <div className="flex items-center bg-white border border-gray-200 rounded-2xl p-1 shadow-sm">
              <button className="p-2 hover:bg-gray-100 rounded-xl transition"><ChevronLeft size={20} /></button>
              <div className="px-6 font-bold text-gray-900 flex items-center">
                <Calendar className="mr-2 text-sky-500" size={18} /> October 24, 2023
              </div>
              <button className="p-2 hover:bg-gray-100 rounded-xl transition"><ChevronRight size={20} /></button>
            </div>
          </div>

          <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
            <div className="grid grid-cols-1 divide-y divide-gray-100">
              {schedule.map((app) => (
                <div key={app.id} className="p-8 hover:bg-gray-50 transition group">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                    <div className="flex items-center space-x-8">
                      <div className="flex flex-col items-center justify-center w-20 h-20 bg-sky-50 rounded-2xl text-sky-600 border border-sky-100 group-hover:bg-sky-600 group-hover:text-white transition-colors duration-300">
                        <span className="text-lg font-black">{app.time}</span>
                      </div>
                      
                      <div>
                        <div className="flex items-center space-x-3 mb-1">
                          <h3 className="text-xl font-bold text-gray-900">{app.patientName}</h3>
                          <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${
                            app.status === 'Completed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                          }`}>
                            {app.status === 'Completed' ? 'Checked Out' : 'Waiting / Confirmed'}
                          </span>
                        </div>
                        <p className="text-gray-500 text-sm flex items-center">
                          <MapPin size={14} className="mr-1" /> Clinic Room #4
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-3 lg:self-center">
                      {app.status === 'Upcoming' ? (
                        <>
                          <button className="px-6 py-3 bg-sky-600 text-white rounded-2xl font-bold hover:bg-sky-700 transition flex items-center">
                            <CheckCircle size={18} className="mr-2" /> Mark Attended
                          </button>
                          <button className="px-6 py-3 bg-white border border-gray-100 text-gray-700 rounded-2xl font-bold hover:bg-gray-50 transition">
                            View Records
                          </button>
                        </>
                      ) : (
                        <button className="px-6 py-3 bg-gray-50 text-gray-400 rounded-2xl font-bold cursor-not-allowed">
                          Consultation Finished
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <DoctorAvailabilityManager doctor={user} />
      )}
    </div>
  );
};

export default DoctorSchedule;
