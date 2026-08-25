'use client';

import React from 'react';
import Link from 'next/link';
import { Mail, MapPin, Phone } from 'lucide-react';
import { CLINIC_ADDRESS, CLINIC_EMAIL, CLINIC_NAME, CLINIC_PHONE } from '@/constants';
import { listDepartments } from '@/services/clinicService';
import { Department } from '@/types';

const patientLoginForService=(department:string)=>`/login?next=${encodeURIComponent(`/book?department=${encodeURIComponent(department)}`)}`;
const linkClass='transition-colors hover:text-sky-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400';

export default function Footer(){
 const [departments,setDepartments]=React.useState<Department[]>([]);
 React.useEffect(()=>{listDepartments().then(setDepartments).catch(()=>setDepartments([]));},[]);
 return <footer className="border-t border-gray-800 bg-gray-900 text-gray-300">
  <div className="mx-auto grid max-w-7xl gap-10 px-6 py-12 sm:grid-cols-2 lg:grid-cols-4 lg:px-8">
   <section><h2 className="mb-4 text-lg font-black text-white">Explore BHCC</h2><ul className="space-y-3 text-base"><li><Link className={linkClass} href="/">Home</Link></li><li><Link className={linkClass} href="/about">About Us</Link></li><li><Link className={linkClass} href="/departments">Our Services</Link></li><li><Link className={linkClass} href="/book">Book Appointment</Link></li><li><Link className={linkClass} href="/feedback">Patient Feedback</Link></li><li><Link className={linkClass} href="/contact">Contact Us</Link></li></ul></section>
   <section><h2 className="mb-4 text-lg font-black text-white">Consultation Services</h2><ul className="space-y-3 text-base">{departments.slice(0,7).map(department=><li key={department.id}><Link className={linkClass} href={patientLoginForService(department.name)}>{department.name}</Link></li>)}{departments.length===0&&<li className="text-gray-500">Services will appear when available.</li>}<li><Link className={`${linkClass} font-bold`} href="/pricing">View consultation pricing</Link></li></ul></section>
   <section><h2 className="mb-4 text-lg font-black text-white">Our Address</h2><p className="mb-3 text-xl font-black text-white">Bhaktivedanta Health Care Center</p><p className="flex items-start gap-3 leading-8"><MapPin className="mt-1 shrink-0 text-sky-500" size={20}/><span>{CLINIC_ADDRESS}</span></p><p className="mt-4 flex items-center gap-3"><Phone className="text-sky-500" size={19}/><a className={linkClass} href={`tel:${CLINIC_PHONE.replace(/\s/g,'')}`}>{CLINIC_PHONE}</a></p><p className="mt-3 flex items-start gap-3 break-all"><Mail className="mt-1 shrink-0 text-sky-500" size={19}/><a className={linkClass} href={`mailto:${CLINIC_EMAIL}`}>{CLINIC_EMAIL}</a></p></section>
   <section><h2 className="mb-4 text-lg font-black text-white">Policies & Support</h2><ul className="space-y-3 text-base"><li><Link className={linkClass} href="/terms">Terms & Conditions</Link></li><li><Link className={linkClass} href="/privacy">Privacy Policy</Link></li><li><Link className={linkClass} href="/cancellation-policy">Cancellation Policy</Link></li><li><Link className={linkClass} href="/refund-policy">Refund Policy</Link></li><li><Link className={linkClass} href="/service-delivery-policy">Service Delivery Policy</Link></li><li><Link className={linkClass} href="/stafflogin">Internal Access</Link></li></ul></section>
  </div>
  <div className="border-t border-gray-800 bg-gray-950 px-6 py-5 text-center text-sm font-semibold text-gray-400">Copyright © {new Date().getFullYear()} {CLINIC_NAME}. All Rights Reserved.</div>
 </footer>;
}
