
import React, { useState } from 'react';
import { User } from '../../types';
import { Search, Filter, MoreVertical, Phone, Mail, Calendar, ArrowRight, User as UserIcon } from 'lucide-react';
import { listDoctorAppointments } from '../../services/clinicService';

const DoctorPatients: React.FC<{ user: User }> = ({ user }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [patients, setPatients] = useState<Array<{ id: string; name: string; age: number; gender: string; lastVisit: string; condition: string; phone: string }>>([]);

  React.useEffect(() => {
    const load = async () => {
      const rows = await listDoctorAppointments(user.id);
      const byPatient = new Map<string, { id: string; name: string; date: string }>();
      rows.forEach((row) => {
        byPatient.set(row.patientId, { id: row.patientId, name: row.patientName, date: row.date });
      });
      const mapped = Array.from(byPatient.values()).map((p) => ({
        id: p.id,
        name: p.name,
        age: 0,
        gender: 'Unknown',
        lastVisit: p.date,
        condition: 'N/A',
        phone: 'N/A',
      }));
      setPatients(mapped);
    };
    load().catch(() => setPatients([]));
  }, [user.id]);

  const filteredPatients = patients.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-10 gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900">{user.name}'s Patients</h1>
          <p className="text-gray-500 font-medium">Overview of all patients you have consulted with.</p>
        </div>
        <div className="flex items-center space-x-3">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input 
              type="text" 
              placeholder="Search by name..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-12 pr-6 py-3 bg-white border border-gray-200 rounded-2xl w-full md:w-64 focus:ring-2 focus:ring-sky-500 transition-all outline-none"
            />
          </div>
          <button className="p-3 bg-white border border-gray-200 rounded-2xl text-gray-500 hover:bg-gray-50 transition">
            <Filter size={20} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {filteredPatients.map((patient) => (
          <div key={patient.id} className="bg-white rounded-[2rem] p-8 border border-gray-100 shadow-sm hover:shadow-xl transition-all group relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-sky-50 rounded-bl-[4rem] -mr-8 -mt-8 opacity-0 group-hover:opacity-100 transition-opacity"></div>
            
            <div className="flex items-start justify-between mb-6">
              <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center text-gray-400 group-hover:bg-sky-600 group-hover:text-white transition-colors">
                <UserIcon size={32} />
              </div>
              <button className="text-gray-300 hover:text-gray-600 transition">
                <MoreVertical size={20} />
              </button>
            </div>

            <h3 className="text-xl font-bold text-gray-900 mb-1">{patient.name}</h3>
            <p className="text-sm text-gray-400 font-medium mb-6">{patient.gender}, {patient.age} yrs</p>
            
            <div className="space-y-4 mb-8">
              <div className="flex items-center text-sm text-gray-600">
                <Calendar size={16} className="mr-3 text-sky-500" />
                <span className="font-medium">Last Visit:</span>
                <span className="ml-2">{patient.lastVisit}</span>
              </div>
              <div className="flex items-center text-sm text-gray-600">
                <Phone size={16} className="mr-3 text-sky-500" />
                <span className="font-medium">Contact:</span>
                <span className="ml-2">{patient.phone}</span>
              </div>
              <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                 <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Diagnosis</p>
                 <p className="text-sm font-bold text-gray-900">{patient.condition}</p>
              </div>
            </div>

            <button className="w-full py-4 bg-gray-50 text-gray-700 rounded-2xl font-bold group-hover:bg-sky-600 group-hover:text-white transition-all flex items-center justify-center">
              View Records <ArrowRight size={18} className="ml-2" />
            </button>
          </div>
        ))}
      </div>
      
      {filteredPatients.length === 0 && (
        <div className="text-center py-20">
          <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <UserIcon size={40} className="text-gray-300" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">No Patients Found</h3>
          <p className="text-gray-500">Try adjusting your search term.</p>
        </div>
      )}
    </div>
  );
};

export default DoctorPatients;
