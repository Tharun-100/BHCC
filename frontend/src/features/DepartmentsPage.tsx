
import React from 'react';
import * as Icons from 'lucide-react';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { listDepartments, listDoctors } from '../services/clinicService';
import { Department, User } from '../types';

const DepartmentsPage: React.FC = () => {
  const [departments, setDepartments] = React.useState<Department[]>([]);
  const [error, setError] = React.useState('');
  const [doctors, setDoctors] = React.useState<User[]>([]);

  React.useEffect(() => {
    let mounted = true;
    const load = async () => {
      const [dbRows, doctorRows] = await Promise.all([listDepartments(), listDoctors()]);
      if (!mounted) return;
      setDepartments(dbRows);
      setDoctors(doctorRows);
    };
    load().catch(() => setError('Services could not be loaded. Please try again.'));
    return () => {
      mounted = false;
    };
  }, []);

  React.useEffect(() => {
    if (departments.length === 0 || !window.location.hash) return;
    const target = document.getElementById(window.location.hash.slice(1));
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [departments]);

  return (
    <div className="bg-gray-50 min-h-screen py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-20">
          <h1 className="text-5xl font-extrabold text-gray-900 mb-6">Our Services</h1>
          <p className="text-xl text-gray-500 max-w-2xl mx-auto leading-relaxed">
            Explore the consultation services currently configured by the clinic.
          </p>
        </div>

        {error && <p className="mb-8 rounded-2xl bg-red-50 p-4 text-center font-semibold text-red-700">{error}</p>}
        {!error && departments.length === 0 && <p className="mb-8 text-center text-gray-500">No services are currently available.</p>}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {departments.map((dept) => {
            const Icon = (Icons as any)[dept.icon] || Icons.Heart;
            const departmentDoctors = doctors.filter((doctor) => doctor.department?.toLowerCase() === dept.name.toLowerCase());
            return (
              <div id={`department-${dept.id}`} key={dept.id} className="bg-white rounded-[2rem] p-10 border border-gray-100 shadow-sm hover:border-sky-400 hover:shadow-xl target:border-sky-500 target:ring-4 target:ring-sky-100 transition-all group overflow-hidden relative">
                <div className="absolute top-0 right-0 w-32 h-32 bg-sky-50 rounded-bl-[5rem] -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
                
                <div className="relative z-10">
                  <div className="w-16 h-16 bg-white text-sky-600 rounded-2xl shadow-lg shadow-sky-100 flex items-center justify-center mb-8 border border-sky-50">
                    <Icon size={32} />
                  </div>
                  
                  <h3 className="text-2xl font-bold text-gray-900 mb-4">{dept.name}</h3>
                  <p className="text-gray-500 mb-8 leading-relaxed">
                    {dept.description}
                  </p>
                  <div className="mb-8 space-y-3">
                    <h4 className="text-xs font-black uppercase tracking-widest text-gray-400">Available doctors</h4>
                    {departmentDoctors.map((doctor) => <div key={doctor.id} className="rounded-2xl border border-gray-100 bg-gray-50 p-4"><div className="flex items-center gap-3"><div className="h-12 w-12 shrink-0 overflow-hidden rounded-2xl bg-sky-100 flex items-center justify-center font-black text-sky-700">{doctor.avatar ? <img src={doctor.avatar} alt={`${doctor.name} profile`} className="h-full w-full object-cover" /> : doctor.name.charAt(0)}</div><div className="min-w-0"><p className="font-black text-gray-900">{doctor.name}</p><p className="text-sm text-sky-700">{[doctor.qualification, doctor.specialty].filter(Boolean).join(' · ')}</p><p className="text-xs text-gray-500">{doctor.experience ? `${doctor.experience} experience` : 'Experience not provided'}{doctor.fee ? ` · ₹${doctor.fee}` : ''}</p></div></div><Link href={`/login?next=${encodeURIComponent(`/book?department=${encodeURIComponent(dept.name)}`)}`} className="mt-3 block rounded-xl bg-sky-600 py-2 text-center text-sm font-black text-white hover:bg-sky-700">Patient login & book</Link></div>)}
                    {departmentDoctors.length === 0 && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">No doctor is currently assigned to this department.</p>}
                  </div>
                  
                  <div className="flex items-center justify-between pt-8 border-t border-gray-50">
                    <span className="text-sm font-bold text-sky-600">Doctor Consultation</span>
                    <Link
                      href={`/login?next=${encodeURIComponent(`/book?department=${encodeURIComponent(dept.name)}`)}`}
                      aria-label={`Login as a patient to book ${dept.name}`}
                      className="w-12 h-12 bg-sky-600 text-white rounded-full flex items-center justify-center hover:bg-sky-700 transition"
                    >
                      <ArrowRight size={24} />
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Consultation Banner */}
        <div className="mt-24 bg-gray-900 rounded-[3rem] p-12 lg:p-20 text-white flex flex-col lg:flex-row items-center gap-12 overflow-hidden relative">
          <div className="lg:w-2/3">
            <h2 className="text-3xl lg:text-4xl font-extrabold mb-6">Book a Doctor Consultation</h2>
            <p className="text-gray-400 text-lg leading-relaxed mb-8">
              Choose the appropriate specialty and book an appointment with an available doctor at our Newtown center.
            </p>
            <div className="flex flex-wrap gap-4">
              <span className="px-4 py-2 bg-gray-800 rounded-full text-sm font-bold">Specialist Doctors</span>
              <span className="px-4 py-2 bg-gray-800 rounded-full text-sm font-bold">Appointment-based Care</span>
              <span className="px-4 py-2 bg-gray-800 rounded-full text-sm font-bold">Newtown, Kolkata</span>
            </div>
          </div>
          <div className="lg:w-1/3">
             <div className="w-48 h-48 bg-sky-500/20 rounded-full flex items-center justify-center p-8 border border-sky-500/30">
                <Icons.Layers size={64} className="text-sky-400" />
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DepartmentsPage;
