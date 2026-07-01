
import React, { useState } from 'react';
import { LabRegistration, User } from '../../types';
import { Users, DollarSign, PlusCircle, Search, Calendar, Clock } from 'lucide-react';
import { createRegistration, listRegistrations } from '../../services/clinicService';

const CounterDashboard: React.FC<{ user: User }> = ({ user }) => {
  const [registrations, setRegistrations] = useState<LabRegistration[]>([]);

  const [newName, setNewName] = useState('');
  const [newAge, setNewAge] = useState('');

  React.useEffect(() => {
    listRegistrations()
      .then((rows) => setRegistrations(rows))
      .catch(() => setRegistrations([]));
  }, []);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName || !newAge) return;

    const age = parseInt(newAge, 10);
    const id = await createRegistration(newName.trim(), age, 200);
    const newReg: LabRegistration = {
      id,
      name: newName.trim(),
      age,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      fee: 200,
    };
    setRegistrations([newReg, ...registrations]);
    setNewName('');
    setNewAge('');
  };

  const totalRevenue = registrations.length * 200;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-10">
        <h1 className="text-3xl font-extrabold text-gray-900">Counter Registration</h1>
        <p className="text-gray-500">Service Lab Registration Portal</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
        <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-xl font-bold text-gray-900 flex items-center">
              <PlusCircle className="mr-2 text-sky-500" size={24} /> New Registration
            </h2>
          </div>
          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Patient Name</label>
              <input 
                type="text" 
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Enter full name"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-sky-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Age</label>
              <input 
                type="number" 
                value={newAge}
                onChange={(e) => setNewAge(e.target.value)}
                placeholder="Enter age"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-sky-500 outline-none"
              />
            </div>
            <div className="p-4 bg-sky-50 rounded-xl border border-sky-100 flex justify-between items-center">
              <span className="text-sm font-bold text-sky-700">Registration Fee</span>
              <span className="text-xl font-black text-sky-900">₹200</span>
            </div>
            <button 
              type="submit"
              className="w-full py-4 bg-sky-600 text-white rounded-xl font-bold hover:bg-sky-700 transition shadow-lg shadow-sky-100"
            >
              Register Patient
            </button>
          </form>
        </div>

        <div className="grid grid-cols-1 gap-6">
          <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm flex flex-col justify-center">
            <div className="w-12 h-12 bg-sky-50 text-sky-600 rounded-2xl flex items-center justify-center mb-4">
              <Users size={24} />
            </div>
            <p className="text-sm text-gray-500 font-bold mb-1">Patients Registered Today</p>
            <p className="text-4xl font-black text-gray-900">{registrations.length}</p>
          </div>
          <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm flex flex-col justify-center">
            <div className="w-12 h-12 bg-green-50 text-green-600 rounded-2xl flex items-center justify-center mb-4">
              <DollarSign size={24} />
            </div>
            <p className="text-sm text-gray-500 font-bold mb-1">Total Collection Today</p>
            <p className="text-4xl font-black text-gray-900">₹{totalRevenue}</p>
            <p className="text-xs text-gray-400 mt-2 italic">* Revenue details visible to Admin only in their portal.</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-8 py-6 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-bold text-gray-900">Today's Registrations</h3>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input 
              type="text" 
              placeholder="Search..." 
              className="pl-10 pr-4 py-2 bg-gray-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-sky-500"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-8 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Patient Name</th>
                <th className="px-8 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Age</th>
                <th className="px-8 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Time</th>
                <th className="px-8 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Fee</th>
                <th className="px-8 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {registrations.map((reg) => (
                <tr key={reg.id} className="hover:bg-gray-50 transition">
                  <td className="px-8 py-5 font-bold text-gray-900">{reg.name}</td>
                  <td className="px-8 py-5 text-sm text-gray-500">{reg.age}</td>
                  <td className="px-8 py-5 text-sm text-gray-500 flex items-center">
                    <Clock size={14} className="mr-1 text-sky-500" /> {reg.time}
                  </td>
                  <td className="px-8 py-5 text-sm font-bold text-gray-900">₹{reg.fee}</td>
                  <td className="px-8 py-5 text-right">
                    <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-[10px] font-black uppercase">Registered</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default CounterDashboard;
