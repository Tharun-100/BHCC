
import React from 'react';
import { ShieldCheck, Heart, UserCheck, Star, Eye, Target } from 'lucide-react';
import { CLINIC_NAME } from '../constants';

const About: React.FC = () => {
  return (
    <div className="bg-white min-h-screen">
      {/* Page Header */}
      <section className="bg-sky-50 py-24">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <h1 className="text-5xl font-black text-gray-900 mb-6 tracking-tight">Healing with <span className="text-sky-600">Devotion</span></h1>
          <p className="text-xl text-gray-500 max-w-3xl mx-auto leading-relaxed font-medium">
            {CLINIC_NAME} is a new healthcare initiative in Newtown, Kolkata, created to bring modern clinical care and spiritual compassion together.
          </p>
        </div>
      </section>

      {/* Philosophy Section */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-4">
          <div className="lg:grid lg:grid-cols-2 lg:gap-20 items-center">
             <div className="relative mb-16 lg:mb-0">
                <img src="/images/compassionate-care.png" alt="Clinic Philosophy" className="rounded-[3rem] shadow-2xl w-full aspect-square object-cover" />
                <div className="absolute -bottom-8 -left-8 bg-white p-10 rounded-[2.5rem] shadow-xl border border-gray-100 hidden md:block max-w-[320px]">
                   <p className="text-sky-600 text-2xl font-black mb-2">New Center</p>
                   <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">Newtown, Kolkata</p>
                </div>
             </div>
             <div>
                <h2 className="text-4xl font-extrabold text-gray-900 mb-8">Our Philosophy</h2>
                <p className="text-lg text-gray-600 leading-relaxed mb-10">
                  We believe that health is not just the absence of disease, but a state of complete physical, mental, and spiritual harmony. Our approach integrates cutting-edge medical science with holistic treatments to treat the whole person, not just the symptoms.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                   <div className="flex flex-col space-y-3">
                      <div className="w-10 h-10 bg-sky-100 text-sky-600 rounded-xl flex items-center justify-center"><Heart size={20} /></div>
                      <h4 className="font-bold text-gray-900">Patient Centric</h4>
                      <p className="text-sm text-gray-500">Every decision we make starts with your comfort and safety.</p>
                   </div>
                   <div className="flex flex-col space-y-3">
                      <div className="w-10 h-10 bg-green-100 text-green-600 rounded-xl flex items-center justify-center"><ShieldCheck size={20} /></div>
                      <h4 className="font-bold text-gray-900">Ethics First</h4>
                      <p className="text-sm text-gray-500">We maintain the highest standards of transparency and integrity.</p>
                   </div>
                </div>
             </div>
          </div>
        </div>
      </section>

      {/* Vision and Mission */}
      <section className="py-24 bg-sky-950 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mb-16">
            <p className="text-sm font-bold text-sky-300 uppercase tracking-widest mb-4">Our Direction</p>
            <h2 className="text-4xl font-black mb-5">Vision and Mission</h2>
            <p className="text-lg text-sky-100 leading-relaxed">
              Building a healthcare institution where clinical excellence, research, compassion, and spiritual growth work together.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-16">
            <div className="lg:col-span-5">
              <div className="flex items-center gap-4 mb-8">
                <div className="w-12 h-12 bg-sky-800 text-sky-200 rounded-lg flex items-center justify-center shrink-0">
                  <Eye size={24} />
                </div>
                <h3 className="text-3xl font-bold">Vision</h3>
              </div>
              <div className="space-y-6 text-sky-100 leading-relaxed">
                <p>
                  To establish a reverberating model of high-quality holistic three-dimensional service encompassing body, mind, and soul, thereby raising consciousness along with the upkeep of health.
                </p>
                <p>
                  To establish a world-class research center bringing Vedic insights to manifestation in the healthcare domain and to bring forth healthcare improvement in novel ways.
                </p>
              </div>
            </div>

            <div className="lg:col-span-7 lg:border-l lg:border-sky-800 lg:pl-16">
              <div className="flex items-center gap-4 mb-8">
                <div className="w-12 h-12 bg-sky-800 text-sky-200 rounded-lg flex items-center justify-center shrink-0">
                  <Target size={24} />
                </div>
                <h3 className="text-3xl font-bold">Mission</h3>
              </div>

              <ol className="space-y-8 text-sky-100 leading-relaxed">
                <li className="flex gap-5">
                  <span className="text-2xl font-black text-sky-300">1</span>
                  <p>Create world-class treatment facilities in gradual phases and continuously upgrade them to provide quality services.</p>
                </li>
                <li className="flex gap-5">
                  <span className="text-2xl font-black text-sky-300">2</span>
                  <div className="space-y-4">
                    <p><strong className="text-white">i.</strong> Create a platform for expert doctors from various specialities to enhance their expertise by adding the spiritual dimension to their lives and the lives of those they treat.</p>
                    <p><strong className="text-white">ii.</strong> Create a platform for society to experience holistic care, cure, and health.</p>
                    <p><strong className="text-white">iii.</strong> Create a varnasrama platform for devotee staff members to sustain and nourish their Krishna Consciousness while contributing to society in a substantial way.</p>
                  </div>
                </li>
                <li className="flex gap-5">
                  <span className="text-2xl font-black text-sky-300">3</span>
                  <p>Create a model of high spiritual fervour and work in devotion and dedication, leading to excellence in healthcare performance.</p>
                </li>
                <li className="flex gap-5">
                  <span className="text-2xl font-black text-sky-300">4</span>
                  <p>Integrate medical treatment with high-end research, thereby leading to publications and patents.</p>
                </li>
              </ol>
            </div>
          </div>
        </div>
      </section>

      {/* Values Section */}
      <section className="py-24 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-20">
            <h2 className="text-4xl font-black text-gray-900 mb-4">Our Core Values</h2>
            <p className="text-gray-500 max-w-xl mx-auto">The principles guiding the development of {CLINIC_NAME}.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            {[
              { title: "Compassion", desc: "Treating every life with the same love and kindness as we would our own kin.", icon: <Heart /> },
              { title: "Precision", desc: "utilizing data and technology for the most accurate diagnoses and treatments.", icon: <Star /> },
              { title: "Trust", desc: "Building lifelong relationships through transparency and professional reliability.", icon: <UserCheck /> }
            ].map((v, i) => (
              <div key={i} className="bg-white p-12 rounded-[2.5rem] text-center shadow-sm border border-gray-100 hover:shadow-xl transition-all">
                <div className="w-16 h-16 bg-sky-50 text-sky-600 rounded-3xl mx-auto mb-8 flex items-center justify-center">
                  {/* Fix: Explicitly cast ReactElement to allow 'size' prop when cloning */}
                  {React.cloneElement(v.icon as React.ReactElement<any>, { size: 32 })}
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-4">{v.title}</h3>
                <p className="text-gray-500 leading-relaxed">{v.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

export default About;
