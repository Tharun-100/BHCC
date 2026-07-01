

'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { User, UserRole } from '../types';
import { Menu, X, LogOut } from 'lucide-react';
import { CLINIC_NAME } from '../constants';
import { BrandLockup } from './BrandLockup';

interface NavbarProps {
  user: User | null;
  onLogout: () => void;
}

const Navbar: React.FC<NavbarProps> = ({ user, onLogout }) => {
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();

  const handleLogout = () => {
    onLogout();
    router.push('/');
  };

  const NavLink = ({ to, children }: { to: string; children?: React.ReactNode }) => (
    <Link 
      href={to} 
      onClick={() => setIsOpen(false)}
      className="px-4 py-2 text-gray-700 hover:text-sky-600 font-medium transition-colors"
    >
      {children}
    </Link>
  );

  return (
    <nav className="sticky top-0 z-50 bg-white shadow-sm border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-28">
          <div className="flex items-center">
            <Link href="/" aria-label={CLINIC_NAME}>
              <BrandLockup />
            </Link>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden xl:flex items-center space-x-1">
            {!user && (
              <>
                <NavLink to="/">Home</NavLink>
                <NavLink to="/about">About Us</NavLink>
                <NavLink to="/departments">Our Services</NavLink>
                <NavLink to="/feedback">Feedback</NavLink>
                <NavLink to="/contact">Contact</NavLink>
                <Link 
                  href="/book" 
                  className="ml-4 px-6 py-2.5 bg-sky-600 text-white rounded-full font-semibold hover:bg-sky-700 transition shadow-lg shadow-sky-100"
                >
                  Book Appointment
                </Link>
                <div className="w-px h-6 bg-gray-200 mx-4" />
                <div className="flex items-center space-x-4">
                  <Link href="/login" className="text-sky-600 font-semibold hover:text-sky-700">Login</Link>
                </div>
              </>
            )}

            {user?.role === UserRole.PATIENT && (
              <>
                <NavLink to="/dashboard">Dashboard</NavLink>
                <NavLink to="/dashboard/profile">Profile</NavLink>
                <NavLink to="/book">Book Appointment</NavLink>
                <NavLink to="/feedback">My Feedback</NavLink>
                <div className="w-px h-6 bg-gray-200 mx-4" />
                <div className="flex items-center space-x-3 mr-4">
                  <div className="w-8 h-8 bg-sky-100 text-sky-600 rounded-full flex items-center justify-center font-bold text-xs">
                    {user.name.charAt(0)}
                  </div>
                  <span className="text-sm font-semibold text-gray-700">{user.name}</span>
                </div>
                <button onClick={handleLogout} className="flex items-center text-gray-700 hover:text-red-500 font-medium">
                  <LogOut size={18} className="mr-1" /> Logout
                </button>
              </>
            )}

            {user?.role === UserRole.DOCTOR && (
              <>
                <NavLink to="/dashboard">Overview</NavLink>
                <NavLink to="/dashboard/profile">Profile</NavLink>
                <NavLink to="/dashboard/schedule">My Schedule</NavLink>
                <NavLink to="/dashboard/patients">Patients</NavLink>
                <div className="w-px h-6 bg-gray-200 mx-4" />
                <div className="flex items-center space-x-3 mr-4">
                  <div className="w-8 h-8 bg-sky-100 text-sky-600 rounded-full flex items-center justify-center font-bold text-xs">
                    {user.name.split(' ').pop()?.charAt(0) || user.name.charAt(0)}
                  </div>
                  <span className="text-sm font-semibold text-gray-700">{user.name}</span>
                </div>
                <button onClick={handleLogout} className="flex items-center text-gray-700 hover:text-red-500 font-medium">
                  <LogOut size={18} className="mr-1" /> Logout
                </button>
              </>
            )}

            {user?.role === UserRole.ADMIN && (
              <>
                <NavLink to="/dashboard">Overview</NavLink>
                <NavLink to="/dashboard/profile">Profile</NavLink>
                <NavLink to="/dashboard/staff">Staff</NavLink>
                <NavLink to="/dashboard/doctors">Doctors</NavLink>
                <NavLink to="/dashboard/departments">Departments</NavLink>
                <NavLink to="/dashboard/revenue">Revenue</NavLink>
                <NavLink to="/dashboard/availability">Availability</NavLink>
                <div className="w-px h-6 bg-gray-200 mx-4" />
                <div className="flex items-center space-x-3 mr-4">
                  <div className="w-8 h-8 bg-sky-100 text-sky-600 rounded-full flex items-center justify-center font-bold text-xs">
                    A
                  </div>
                  <span className="text-sm font-semibold text-gray-700">{user.name}</span>
                </div>
                <button onClick={handleLogout} className="flex items-center text-gray-700 hover:text-red-500 font-medium">
                  <LogOut size={18} className="mr-1" /> Logout
                </button>
              </>
            )}

            {user?.role === UserRole.COUNTER && (
              <>
                <NavLink to="/dashboard">Counter Dashboard</NavLink>
                <NavLink to="/dashboard/profile">Profile</NavLink>
                <div className="w-px h-6 bg-gray-200 mx-4" />
                <div className="flex items-center space-x-3 mr-4">
                  <div className="w-8 h-8 bg-sky-100 text-sky-600 rounded-full flex items-center justify-center font-bold text-xs">
                    C
                  </div>
                  <span className="text-sm font-semibold text-gray-700">{user.name}</span>
                </div>
                <button onClick={handleLogout} className="flex items-center text-gray-700 hover:text-red-500 font-medium">
                  <LogOut size={18} className="mr-1" /> Logout
                </button>
              </>
            )}

            {user?.role === UserRole.STAFF && (
              <>
                <NavLink to="/dashboard">Staff Dashboard</NavLink>
                <NavLink to="/dashboard/profile">Profile</NavLink>
                <div className="w-px h-6 bg-gray-200 mx-4" />
                <div className="flex items-center space-x-3 mr-4">
                  <div className="w-8 h-8 bg-sky-100 text-sky-600 rounded-full flex items-center justify-center font-bold text-xs">
                    S
                  </div>
                  <span className="text-sm font-semibold text-gray-700">{user.name}</span>
                </div>
                <button onClick={handleLogout} className="flex items-center text-gray-700 hover:text-red-500 font-medium">
                  <LogOut size={18} className="mr-1" /> Logout
                </button>
              </>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="xl:hidden flex items-center">
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 focus:outline-none"
            >
              {isOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Navigation */}
      {isOpen && (
        <div className="xl:hidden bg-white border-b border-gray-100 py-4 px-4 space-y-2">
          {!user ? (
            <>
              <Link href="/" className="block py-2 text-gray-700" onClick={() => setIsOpen(false)}>Home</Link>
              <Link href="/about" className="block py-2 text-gray-700" onClick={() => setIsOpen(false)}>About</Link>
              <Link href="/departments" className="block py-2 text-gray-700" onClick={() => setIsOpen(false)}>Our Services</Link>
              <Link href="/book" className="block py-3 text-center bg-sky-600 text-white rounded-xl" onClick={() => setIsOpen(false)}>Book Appointment</Link>
              <Link href="/login" className="block py-2 text-sky-600 font-bold" onClick={() => setIsOpen(false)}>Login / Register</Link>
            </>
          ) : (
            <>
              <div className="py-2 border-b border-gray-50 mb-2">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Logged in as</p>
                <p className="text-sm font-bold text-gray-900">{user.name}</p>
              </div>
              <Link href="/dashboard" className="block py-2 text-gray-700" onClick={() => setIsOpen(false)}>Dashboard</Link>
              {user.role !== UserRole.PUBLIC && (
                <Link href="/dashboard/profile" className="block py-2 text-gray-700" onClick={() => setIsOpen(false)}>Profile</Link>
              )}
              {user.role === UserRole.DOCTOR && (
                <>
                  <Link href="/dashboard/schedule" className="block py-2 text-gray-700" onClick={() => setIsOpen(false)}>My Schedule</Link>
                  <Link href="/dashboard/patients" className="block py-2 text-gray-700" onClick={() => setIsOpen(false)}>Patients</Link>
                </>
              )}
              {user.role === UserRole.ADMIN && (
                <>
                  <Link href="/dashboard/doctors" className="block py-2 text-gray-700" onClick={() => setIsOpen(false)}>Doctors</Link>
                  <Link href="/dashboard/staff" className="block py-2 text-gray-700" onClick={() => setIsOpen(false)}>Staff</Link>
                  <Link href="/dashboard/departments" className="block py-2 text-gray-700" onClick={() => setIsOpen(false)}>Departments</Link>
                  <Link href="/dashboard/revenue" className="block py-2 text-gray-700" onClick={() => setIsOpen(false)}>Revenue</Link>
                  <Link href="/dashboard/availability" className="block py-2 text-gray-700" onClick={() => setIsOpen(false)}>Availability</Link>
                </>
              )}
              {user.role === UserRole.COUNTER && (
                <>
                  <Link href="/dashboard" className="block py-2 text-gray-700" onClick={() => setIsOpen(false)}>Counter Portal</Link>
                </>
              )}
              <button onClick={handleLogout} className="block w-full text-left py-2 text-red-500 font-medium">Logout</button>
            </>
          )}
        </div>
      )}
    </nav>
  );
};

export default Navbar;
