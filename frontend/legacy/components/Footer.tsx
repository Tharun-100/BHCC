
import React from 'react';
import { MapPin, Phone, Mail, Instagram, Facebook, Twitter } from 'lucide-react';
import { CLINIC_NAME, CLINIC_ADDRESS, CLINIC_PHONE, CLINIC_EMAIL } from '../constants';

const Footer: React.FC = () => {
  return (
    <footer className="bg-gray-900 text-gray-300 pt-16 pb-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-12">
          {/* Brand */}
          <div>
            <div className="flex items-center space-x-2 mb-6">
              <img src="/bhcc-logo.png" alt={CLINIC_NAME} className="w-8 h-8 rounded-lg object-contain" />
              <span className="text-xl font-bold text-white">{CLINIC_NAME}</span>
            </div>
            <p className="text-sm leading-relaxed mb-6">
              {CLINIC_NAME} is dedicated to providing high-quality, compassionate, and personalized healthcare services for our community.
            </p>
            <div className="flex space-x-4">
              <Facebook className="hover:text-sky-400 cursor-pointer transition" size={20} />
              <Twitter className="hover:text-sky-400 cursor-pointer transition" size={20} />
              <Instagram className="hover:text-sky-400 cursor-pointer transition" size={20} />
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-white font-bold mb-6">Quick Links</h3>
            <ul className="space-y-4 text-sm">
              <li><a href="/" className="hover:text-sky-400 transition">Home</a></li>
              <li><a href="/#/about" className="hover:text-sky-400 transition">About Us</a></li>
              <li><a href="/#/departments" className="hover:text-sky-400 transition">Departments</a></li>
              <li><a href="/#/book" className="hover:text-sky-400 transition">Book Appointment</a></li>
            </ul>
          </div>

          {/* Services */}
          <div>
            <h3 className="text-white font-bold mb-6">Our Services</h3>
            <ul className="space-y-4 text-sm">
              <li>General Health Checkup</li>
              <li>Cardiology Services</li>
              <li>Ayurvedic Consultations</li>
              <li>Neurology Diagnosis</li>
              <li>Orthopedic Surgery</li>
            </ul>
          </div>

          {/* Contact */}
          <div>
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
        
        <div className="border-t border-gray-800 pt-8 text-center text-xs text-gray-500">
          <p>© {new Date().getFullYear()} {CLINIC_NAME}. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
