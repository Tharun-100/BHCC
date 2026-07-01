
import React, { useState } from 'react';
import { User } from '../../types';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import DoctorAvailabilityManager from '../../components/DoctorAvailabilityManager';
import { listDoctors } from '../../services/clinicService';

const AdminAvailability: React.FC<{ user: User }> = ({ user }) => {
  const [selectedDoctor, setSelectedDoctor] = useState<User | null>(null);
  const [doctors, setDoctors] = useState<User[]>([]);

  React.useEffect(() => {
    listDoctors()
      .then((rows) => setDoctors(rows))
      .catch(() => setDoctors([]));
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-10">
        <h1 className="text-3xl font-extrabold text-gray-900">Doctor Availability</h1>
        <p className="text-gray-500">Configure and manage consultation slots for all clinic doctors.</p>
      </div>

      <div className="space-y-8">
        {!selectedDoctor ? (
          <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-8 py-6 border-b border-gray-100">
              <h3 className="font-bold text-gray-900">Select Doctor to Manage Availability</h3>
            </div>
            <div className="divide-y divide-gray-100">
              {doctors.map(doc => (
                <div 
                  key={doc.id} 
                  onClick={() => setSelectedDoctor(doc)}
                  className="px-8 py-6 flex items-center justify-between hover:bg-gray-50 cursor-pointer transition group"
                >
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 bg-sky-50 text-sky-600 rounded-2xl flex items-center justify-center font-black">
                      {doc.name.split(' ').pop()?.charAt(0)}
                    </div>
                    <div>
                      <h4 className="font-bold text-gray-900">{doc.name}</h4>
                      <p className="text-xs text-gray-500">{doc.specialty} • {doc.department}</p>
                    </div>
                  </div>
                  <ChevronRight size={20} className="text-gray-300 group-hover:text-sky-500 transition-colors" />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div>
            <button 
              onClick={() => setSelectedDoctor(null)}
              className="mb-6 text-sm font-bold text-sky-600 hover:text-sky-700 flex items-center"
            >
              <ChevronLeft size={16} className="mr-1" /> Back to Doctor List
            </button>
            <DoctorAvailabilityManager
              doctor={selectedDoctor}
              isAdmin={true}
              onSave={(weeklySchedule) => {
                const updatedDoctor = { ...selectedDoctor, weeklySchedule, availableDays: Object.keys(weeklySchedule) };
                setSelectedDoctor(updatedDoctor);
                setDoctors((current) => current.map((doctor) => doctor.id === updatedDoctor.id ? updatedDoctor : doctor));
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminAvailability;
