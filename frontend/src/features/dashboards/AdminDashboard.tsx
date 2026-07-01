
import React from 'react';
import { User } from '../../types';
import { Users, Calendar, Wallet, Heart, Search, MoreVertical } from 'lucide-react';

const AdminDashboard: React.FC<{ user: User }> = ({ user }) => {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-10">
        <h1 className="text-3xl font-extrabold text-gray-900">Welcome, {user.name}</h1>
        <p className="text-gray-500">Clinic Overview & Quick Actions</p>
      </div>

      {/* Admin Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
        {[
          { label: 'Total Patients', val: '4,285', icon: <Users />, color: 'bg-sky-50 text-sky-600' },
          { label: 'Appointments Today', val: '42', icon: <Calendar />, color: 'bg-amber-50 text-amber-600' },
          { label: 'Active Doctors', val: '18', icon: <Heart />, color: 'bg-red-50 text-red-600' },
          { label: 'Gross Revenue', val: '₹1,45,000', icon: <Wallet />, color: 'bg-green-50 text-green-600' },
        ].map((stat, idx) => (
          <div key={idx} className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
            <div className={`w-12 h-12 ${stat.color} rounded-2xl flex items-center justify-center mb-4`}>
              {React.cloneElement(stat.icon as React.ReactElement<any>, { size: 24 })}
            </div>
            <p className="text-sm text-gray-500 font-bold mb-1">{stat.label}</p>
            <p className="text-2xl font-black text-gray-900">{stat.val}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-8 py-6 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-bold text-gray-900">Recent Appointments</h3>
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input 
                  type="text" 
                  placeholder="Search patient..." 
                  className="pl-10 pr-4 py-2 bg-gray-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-sky-500"
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
                    <th className="px-8 py-4"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {[
                    { p: 'Vikram Seth', d: 'Dr. Aarav Sharma', f: '₹1,500', s: 'Paid' },
                    { p: 'Anjali Desai', d: 'Dr. Ishani Gupta', f: '₹800', s: 'Paid' },
                    { p: 'Karan Mehra', d: 'Dr. Rohan Mehra', f: '₹600', s: 'Pending' },
                  ].map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50 transition">
                      <td className="px-8 py-5 font-bold text-gray-900">{row.p}</td>
                      <td className="px-8 py-5 text-sm text-gray-500">{row.d}</td>
                      <td className="px-8 py-5 text-sm font-bold text-sky-600">{row.f}</td>
                      <td className="px-8 py-5">
                        <span className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider ${
                          row.s === 'Paid' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          {row.s}
                        </span>
                      </td>
                      <td className="px-8 py-5 text-right">
                        <button className="text-gray-400 hover:text-gray-900">
                          <MoreVertical size={18} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div>
          <div className="bg-gray-900 rounded-[2rem] p-8 text-white shadow-xl">
            <h3 className="font-bold mb-6">Clinic Health</h3>
            <div className="space-y-6">
              <div className="p-4 bg-gray-800 rounded-2xl">
                <p className="text-xs text-gray-400 uppercase font-bold mb-1">Patient Satisfaction</p>
                <div className="flex items-center justify-between">
                  <span className="text-xl font-black">98%</span>
                  <div className="flex text-amber-400">
                    {[1,2,3,4,5].map(i => <Heart key={i} size={12} fill="currentColor" />)}
                  </div>
                </div>
              </div>
              <div className="p-4 bg-gray-800 rounded-2xl">
                <p className="text-xs text-gray-400 uppercase font-bold mb-1">Queue Efficiency</p>
                <p className="text-xl font-black">12 min <span className="text-xs font-normal text-gray-400">avg wait</span></p>
              </div>
              <div className="p-4 bg-sky-600 rounded-2xl">
                <p className="text-xs text-white/70 uppercase font-bold mb-1">Weekly Growth</p>
                <p className="text-xl font-black">+18.4%</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
