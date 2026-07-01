
import React from 'react';
import { User } from '../../types';
import { Wallet, TrendingUp, DollarSign, ArrowUpRight, ArrowDownRight, Users } from 'lucide-react';
import { listAllAppointments, listRegistrations } from '../../services/clinicService';

const AdminRevenue: React.FC<{ user: User }> = ({ user }) => {
  const [labRegistrations, setLabRegistrations] = React.useState(0);
  const [doctorRevenue, setDoctorRevenue] = React.useState(0);
  const labRevenue = labRegistrations * 200;
  const totalRevenue = doctorRevenue + labRevenue;

  React.useEffect(() => {
    const load = async () => {
      const [regs, appointments] = await Promise.all([listRegistrations(), listAllAppointments()]);
      setLabRegistrations(regs.length);
      const completed = appointments.filter((a) => a.status === 'Completed');
      const clinicShare = completed.reduce((sum, row) => sum + row.fee * 0.5, 0);
      setDoctorRevenue(clinicShare);
    };
    load().catch(() => {
      setLabRegistrations(0);
      setDoctorRevenue(0);
    });
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-10">
        <h1 className="text-3xl font-extrabold text-gray-900">Revenue Analytics</h1>
        <p className="text-gray-500">Track all clinic income streams and financial performance.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm">
          <div className="w-12 h-12 bg-green-50 text-green-600 rounded-2xl flex items-center justify-center mb-4">
            <Wallet size={24} />
          </div>
          <p className="text-sm text-gray-500 font-bold mb-1">Total Gross Revenue</p>
          <p className="text-3xl font-black text-gray-900">₹{totalRevenue.toLocaleString()}</p>
          <div className="mt-4 flex items-center text-green-600 text-xs font-bold">
            <ArrowUpRight size={14} className="mr-1" /> +12.5% from last month
          </div>
        </div>

        <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm">
          <div className="w-12 h-12 bg-sky-50 text-sky-600 rounded-2xl flex items-center justify-center mb-4">
            <TrendingUp size={24} />
          </div>
          <p className="text-sm text-gray-500 font-bold mb-1">Doctor Consultations (Share)</p>
          <p className="text-3xl font-black text-gray-900">₹{doctorRevenue.toLocaleString()}</p>
          <p className="text-xs text-gray-400 mt-2">50% share of total doctor fees</p>
        </div>

        <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm">
          <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center mb-4">
            <Users size={24} />
          </div>
          <p className="text-sm text-gray-500 font-bold mb-1">Service Lab Revenue</p>
          <p className="text-3xl font-black text-gray-900">₹{labRevenue.toLocaleString()}</p>
          <p className="text-xs text-gray-400 mt-2">{labRegistrations} registrations @ ₹200 each</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm p-8">
          <h3 className="font-bold text-gray-900 mb-8">Revenue Breakdown</h3>
          <div className="space-y-6">
            <div>
              <div className="flex justify-between text-sm font-bold mb-2">
                <span className="text-gray-500">Doctor Consultations</span>
                <span className="text-gray-900">₹{doctorRevenue.toLocaleString()}</span>
              </div>
              <div className="w-full bg-gray-100 h-3 rounded-full overflow-hidden">
                <div className="bg-sky-500 h-full" style={{ width: `${(doctorRevenue / totalRevenue) * 100}%` }}></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm font-bold mb-2">
                <span className="text-gray-500">Service Lab (Counter)</span>
                <span className="text-gray-900">₹{labRevenue.toLocaleString()}</span>
              </div>
              <div className="w-full bg-gray-100 h-3 rounded-full overflow-hidden">
                <div className="bg-purple-500 h-full" style={{ width: `${(labRevenue / totalRevenue) * 100}%` }}></div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-gray-900 rounded-[2.5rem] p-8 text-white shadow-xl">
          <h3 className="font-bold mb-6">Financial Summary</h3>
          <div className="space-y-4">
            <div className="flex justify-between py-3 border-b border-gray-800">
              <span className="text-gray-400">Total Transactions</span>
              <span className="font-bold">158</span>
            </div>
            <div className="flex justify-between py-3 border-b border-gray-800">
              <span className="text-gray-400">Average Ticket Size</span>
              <span className="font-bold">₹512</span>
            </div>
            <div className="flex justify-between py-3 border-b border-gray-800">
              <span className="text-gray-400">Net Profit Margin</span>
              <span className="font-bold text-green-400">22.4%</span>
            </div>
            <div className="pt-4">
              <button className="w-full py-3 bg-sky-600 text-white rounded-xl font-bold hover:bg-sky-700 transition">
                Generate Monthly Statement
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminRevenue;
