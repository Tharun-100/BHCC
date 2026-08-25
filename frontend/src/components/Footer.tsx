'use client';

import React from 'react';
import Link from 'next/link';
import { MapPin, Phone, Mail, Instagram, Facebook, Twitter } from 'lucide-react';
import { CLINIC_NAME, CLINIC_ADDRESS, CLINIC_PHONE, CLINIC_EMAIL } from '../constants';
import { BrandLockup } from './BrandLockup';
import { listDepartments } from '@/services/clinicService';
import { Department } from '@/types';

const patientLoginForService = (department: string) =>
  `/login?next=${encodeURIComponent(`/book?department=${encodeURIComponent(department)}`)}`;

const Footer: React.FC = () => {
  const [departments, setDepartments] = React.useState<Department[]>([]);
  React.useEffect(() => { listDepartments().then(setDepartments).catch(() => setDepartments([])); }, []);
  return (
    <footer className="bg-gray-900 text-gray-300 pt-16 pb-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-12 mb-12">
          <div className="xl:col-span-5">
            <div className="mb-6"><BrandLockup inverse /></div>
            <p className="text-sm leading-relaxed mb-6">
              {CLINIC_NAME} is dedicated to providing high-quality, compassionate, and personalized healthcare services for our community.
            </p>
            <div className="flex space-x-4">
              <Facebook className="hover:text-sky-400 cursor-pointer transition" size={20} />
              <Twitter className="hover:text-sky-400 cursor-pointer transition" size={20} />
              <Instagram className="hover:text-sky-400 cursor-pointer transition" size={20} />
            </div>
          </div>

          <div className="xl:col-span-2">
            <h3 className="text-white font-bold mb-6">Quick Links</h3>
            <ul className="space-y-4 text-sm">
              <li><Link href="/" className="hover:text-sky-400 transition">Home</Link></li>
              <li><Link href="/about" className="hover:text-sky-400 transition">About Us</Link></li>
              <li><Link href="/departments" className="hover:text-sky-400 transition">Our Services</Link></li>
              <li><Link href="/book" className="hover:text-sky-400 transition">Book Appointment</Link></li>
            </ul>
          </div>

          <div className="xl:col-span-2">
            <h3 className="text-white font-bold mb-6">Our Services</h3>
            <ul className="space-y-4 text-sm">
              {departments.map((department) => (
                <li key={department.id}>
                  <Link href={patientLoginForService(department.name)} className="hover:text-sky-400 transition">
                    {department.name} Consultation
                  </Link>
                </li>
              ))}
              {departments.length === 0 && <li className="text-gray-500">Services will appear here when available.</li>}
            </ul>
          </div>

          <div className="xl:col-span-3">
            <h3 className="text-white font-bold mb-6">Contact Us</h3>
            <ul className="space-y-4 text-sm">
              <li className="flex items-start space-x-3">
                <MapPin size={18} className="text-sky-500 shrink-0" />
                <span>{CLINIC_ADDRESS}</span>
              </li>
              <li className="flex items-center space-x-3">
                <Phone size={18} className="text-sky-500 shrink-0" />
                <span>{CLINIC_PHONE}</span>
              </li>
              <li className="flex items-center space-x-3">
                <Mail size={18} className="text-sky-500 shrink-0" />
                <span>{CLINIC_EMAIL}</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-gray-800 py-8">
          <h3 className="mb-4 text-sm font-bold text-white">Policies & Payment Information</h3>
          <div className="grid grid-cols-2 gap-3 text-xs text-gray-400 sm:grid-cols-3 lg:grid-cols-6">
            <Link href="/pricing" className="hover:text-sky-400">Consultation Pricing</Link>
            <Link href="/cancellation-policy" className="hover:text-sky-400">Cancellation Policy</Link>
            <Link href="/refund-policy" className="hover:text-sky-400">Refund Policy</Link>
            <Link href="/service-delivery-policy" className="hover:text-sky-400">Service Delivery</Link>
            <Link href="/terms" className="hover:text-sky-400">Terms & Conditions</Link>
            <Link href="/privacy" className="hover:text-sky-400">Privacy Policy</Link>
          </div>
        </div>
        <div className="border-t border-gray-800 pt-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-500">
          <p>(c) {new Date().getFullYear()} {CLINIC_NAME}. All rights reserved.</p>
          <div className="flex gap-4"><Link href="/about" className="hover:text-gray-300">About Us</Link><Link href="/contact" className="hover:text-gray-300">Contact Us</Link><Link href="/stafflogin" className="text-gray-700 hover:text-gray-400 transition-colors">Internal access</Link></div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
