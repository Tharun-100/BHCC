
import React from 'react';
import Link from 'next/link';
import { DEPARTMENTS as FALLBACK_DEPARTMENTS, DOCTORS as FALLBACK_DOCTORS, isCurrentService, mergeCurrentDepartments } from '../constants';
import { listDepartments, listDoctors } from '../services/clinicService';
import { Department, User } from '../types';
import { ArrowRight, Heart, Shield, Users, CalendarCheck, MapPin } from 'lucide-react';
import * as LucideIcons from 'lucide-react';

const getDoctorInitials = (name: string) =>
  name
    .replace(/^Dr\.?\s*/i, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');

const Home: React.FC = () => {
  const [departments, setDepartments] = React.useState<Department[]>(FALLBACK_DEPARTMENTS);
  const [doctors, setDoctors] = React.useState<User[]>(FALLBACK_DOCTORS);

  React.useEffect(() => {
    let mounted = true;
    const load = async () => {
      const [dbDepartments, dbDoctors] = await Promise.all([listDepartments(), listDoctors()]);
      if (!mounted) return;
      setDepartments(mergeCurrentDepartments(dbDepartments));
      setDoctors(dbDoctors.filter((doctor) => isCurrentService(doctor.department)));
    };
    load().catch(() => null);
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="flex flex-col w-full">
      {/* Hero Section */}
      <section className="relative bg-sky-50 py-20 lg:py-32 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="lg:grid lg:grid-cols-2 lg:gap-8 items-center">
            <div>
              <div className="inline-flex items-center space-x-2 px-4 py-2 bg-sky-100 text-sky-700 rounded-full text-sm font-bold mb-6">
                <Heart size={16} />
                <span>Your Health, Our Devotion</span>
              </div>
              <h1 className="text-5xl lg:text-7xl font-extrabold text-gray-900 leading-tight mb-6">
                Compassionate Care for <span className="text-sky-600">Every Soul.</span>
              </h1>
              <p className="text-lg text-gray-600 mb-10 max-w-lg leading-relaxed">
                A new healthcare center in Newtown, Kolkata, committed to compassionate and holistic care for the body, mind, and soul.
              </p>
              <div className="flex flex-col sm:flex-row space-y-4 sm:space-y-0 sm:space-x-4">
                <Link href="/book" className="px-8 py-4 bg-sky-600 text-white rounded-full font-bold text-lg hover:bg-sky-700 transition flex items-center justify-center shadow-xl shadow-sky-200">
                  Book Appointment <ArrowRight className="ml-2" size={20} />
                </Link>
                <Link href="/about" className="px-8 py-4 bg-white text-gray-900 border-2 border-gray-200 rounded-full font-bold text-lg hover:bg-gray-50 transition flex items-center justify-center">
                  Learn More
                </Link>
              </div>
              <div className="mt-12 flex items-center space-x-6 text-sm text-gray-500 font-medium">
                <div className="flex items-center"><MapPin className="mr-2 text-sky-500" size={18} /> Newtown, Kolkata</div>
                <div className="flex items-center"><Heart className="mr-2 text-amber-500" size={18} /> Holistic Care</div>
              </div>
            </div>
            <div className="mt-16 lg:mt-0 relative">
              <div className="absolute inset-0 bg-sky-200 rounded-full filter blur-3xl opacity-30 animate-pulse"></div>
              <img 
                src="/images/clinic-hero.png" 
                alt="Hospital Care" 
                className="relative z-10 rounded-3xl shadow-2xl border-8 border-white object-cover w-full h-[400px] lg:h-[500px]"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              { label: 'Our Location', val: 'Newtown' },
              { label: 'Care Model', val: 'Holistic' },
              { label: 'Our Approach', val: 'Patient First' },
              { label: 'Our Purpose', val: 'Community Care' },
            ].map((stat, i) => (
              <div key={i} className="text-center p-6 rounded-2xl bg-gray-50 border border-gray-100">
                <div className="text-3xl font-extrabold text-sky-600 mb-2">{stat.val}</div>
                <div className="text-gray-500 font-medium">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Services Preview */}
      <section className="py-24 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-extrabold text-gray-900 mb-4">Our Services</h2>
            <p className="text-gray-600 max-w-2xl mx-auto">Doctor consultations are currently available across five specialist areas.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {departments.slice(0, 3).map((dept) => {
              const IconComp = (LucideIcons as any)[dept.icon] || Heart;
              return (
                <div key={dept.id} className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 hover:shadow-xl transition-shadow group">
                  <div className="w-14 h-14 bg-sky-100 text-sky-600 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-sky-600 group-hover:text-white transition-colors">
                    <IconComp size={30} />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-4">{dept.name}</h3>
                  <p className="text-gray-500 mb-6 leading-relaxed">{dept.description}</p>
                  <Link href="/departments" className="text-sky-600 font-bold flex items-center hover:text-sky-700">
                    Learn more <ArrowRight className="ml-2" size={18} />
                  </Link>
                </div>
              );
            })}
          </div>
          <div className="text-center mt-12">
            <Link href="/departments" className="inline-flex items-center text-gray-500 font-semibold hover:text-sky-600 transition">
              View all services <ArrowRight className="ml-2" size={18} />
            </Link>
          </div>
        </div>
      </section>

      {/* Why Choose Us */}
      <section className="py-24 bg-white overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:grid lg:grid-cols-2 lg:gap-16 items-center">
            <div className="relative mb-16 lg:mb-0">
               <img 
                src="/images/compassionate-care.png" 
                alt="Our Values" 
                className="rounded-3xl shadow-2xl w-full aspect-square object-cover"
              />
              <div className="absolute -bottom-8 -right-8 bg-sky-600 p-8 rounded-3xl text-white shadow-xl hidden md:block max-w-[280px]">
                <CalendarCheck className="mb-4" size={32} />
                <h4 className="text-xl font-bold mb-2">Specialist Consultations</h4>
                <p className="text-sky-100 text-sm">Schedule a consultation with one of our currently available specialists.</p>
              </div>
            </div>
            <div>
              <h2 className="text-4xl font-extrabold text-gray-900 mb-8 leading-tight">Why Choose Bhaktivedanta Health Care Center?</h2>
              <div className="space-y-8">
                {[
                  { title: 'Focused Consultations', desc: 'Access doctor consultations across our five currently available specialist areas.', icon: <Leaf className="text-green-500" /> },
                  { title: 'Responsible Guidance', desc: 'Receive thoughtful clinical guidance focused on your individual health concerns.', icon: <Shield className="text-sky-500" /> },
                  { title: 'Compassionate Staff', desc: 'Our caregivers treat every patient as family, with kindness and empathy.', icon: <Users className="text-amber-500" /> },
                ].map((item, idx) => (
                  <div key={idx} className="flex space-x-6">
                    <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center shrink-0">
                      {item.icon}
                    </div>
                    <div>
                      <h4 className="text-xl font-bold text-gray-900 mb-2">{item.title}</h4>
                      <p className="text-gray-500 leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Doctors */}
      {doctors.length > 0 && <section className="py-24 bg-sky-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-extrabold text-gray-900 mb-4">Our Experts</h2>
            <p className="text-gray-600 max-w-2xl mx-auto">Meet specialists committed to thoughtful, compassionate care for every patient.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {doctors.map((doc) => (
              <div key={doc.id} className="bg-white rounded-3xl overflow-hidden shadow-sm hover:shadow-xl transition-all group">
                <div className="h-64 overflow-hidden relative bg-sky-100 flex items-center justify-center">
                  <div className="w-28 h-28 rounded-full bg-white text-sky-700 shadow-sm flex items-center justify-center text-4xl font-black">
                    {getDoctorInitials(doc.name)}
                  </div>
                  <div className="absolute top-4 right-4 bg-sky-600 text-white text-xs font-bold px-3 py-1 rounded-full">{doc.experience} Exp</div>
                </div>
                <div className="p-6 text-center">
                  <h3 className="text-lg font-extrabold text-gray-900 mb-1">{doc.name}</h3>
                  <p className="text-sky-600 text-sm font-semibold mb-3">{doc.department}</p>
                  <p className="text-gray-400 text-xs mb-6 italic">{doc.specialty}</p>
                  <Link href="/book" className="block w-full py-3 bg-gray-50 text-gray-900 rounded-xl font-bold hover:bg-sky-600 hover:text-white transition-colors">
                    Consult Now
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>}

      {/* Care Commitments */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-extrabold text-gray-900 mb-4">Our Care Commitments</h2>
            <p className="text-gray-600 max-w-2xl mx-auto">The standards we are building into every patient interaction at our new center.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { title: 'Listen with Empathy', text: 'Give every patient time, attention, dignity, and a clear understanding of their care.' },
              { title: 'Treat with Integrity', text: 'Make transparent and responsible clinical decisions centered on patient well-being.' },
              { title: 'Care for the Whole Person', text: 'Support physical health while respecting mental, emotional, and spiritual needs.' }
            ].map((item) => (
              <div key={item.title} className="bg-gray-50 p-10 rounded-3xl border border-gray-100">
                <Heart className="text-sky-600 mb-6" size={28} />
                <h3 className="text-xl font-bold text-gray-900 mb-3">{item.title}</h3>
                <p className="text-gray-600 leading-relaxed">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-sky-600 rounded-[3rem] p-12 lg:p-20 text-center text-white relative overflow-hidden shadow-2xl shadow-sky-200">
            <div className="absolute -top-24 -left-24 w-64 h-64 bg-white opacity-10 rounded-full filter blur-3xl"></div>
            <div className="absolute -bottom-24 -right-24 w-64 h-64 bg-white opacity-10 rounded-full filter blur-3xl"></div>
            <h2 className="text-4xl lg:text-5xl font-extrabold mb-8 relative z-10">Start Your Healing Journey Today</h2>
            <p className="text-xl text-sky-100 mb-12 relative z-10 max-w-2xl mx-auto">Take the first step towards better health and mental peace. Book an appointment with our specialists in just a few clicks.</p>
            <Link href="/book" className="inline-flex items-center px-10 py-5 bg-white text-sky-600 rounded-full font-extrabold text-xl hover:bg-sky-50 transition shadow-xl relative z-10">
              Book Appointment Now
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};

// Help helper for icons
const Leaf: React.FC<{className?: string}> = ({className}) => <LucideIcons.Leaf className={className} />;

export default Home;
