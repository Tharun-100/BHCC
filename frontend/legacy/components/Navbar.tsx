
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { User, UserRole } from '../types';
import { Menu, X, User as UserIcon, LogOut } from 'lucide-react';
import { CLINIC_NAME } from '../constants';

interface NavbarProps {
  user: User | null;
  onLogout: () => void;
}

const Navbar: React.FC<NavbarProps> = ({ user, onLogout }) => {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();
  const [brandFirst, ...brandRest] = CLINIC_NAME.split(' ');

  const handleLogout = () => {
    onLogout();
    navigate('/');
  };

  const NavLink = ({ to, children }: { to: string; children?: React.ReactNode }) => (
    <Link 
      to={to} 
      onClick={() => setIsOpen(false)}
      className="px-4 py-2 text-gray-700 hover:text-sky-600 font-medium transition-colors"
    >
      {children}
    </Link>
  );

  return (
    <nav className="sticky top-0 z-50 bg-white shadow-sm border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-20">
          <div className="flex items-center">
            <Link to="/" className="flex items-center space-x-2">
              <img
                src="/bhcc-logo.png"
                alt={CLINIC_NAME}
                className="w-10 h-10 rounded-xl object-contain"
              />
              <span className="text-xl font-bold text-gray-900 tracking-tight">
                <span className="text-sky-700">{brandFirst}</span>{' '}
                <span className="text-gray-800">{brandRest.join(' ')}</span>
              </span>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-1">
            {!user && (
              <>
                <NavLink to="/">Home</NavLink>
                <NavLink to="/about">About Us</NavLink>
                <NavLink to="/departments">Departments</NavLink>
                <NavLink to="/feedback">Feedback</NavLink>
                <NavLink to="/contact">Contact</NavLink>
                <Link 
                  to="/book" 
                  className="ml-4 px-6 py-2.5 bg-sky-600 text-white rounded-full font-semibold hover:bg-sky-700 transition shadow-lg shadow-sky-100"
                >
                  Book Appointment
                </Link>
                <div className="w-px h-6 bg-gray-200 mx-4" />
                <div className="flex items-center space-x-4">
                  <Link to="/login" className="text-sky-600 font-semibold hover:text-sky-700">Patient Login</Link>
                  <span className="text-gray-300">|</span>
                  <Link to="/stafflogin" className="text-gray-600 font-semibold hover:text-sky-700">Staff Login</Link>
                </div>
              </>
            )}

            {user?.role === UserRole.PATIENT && (
              <>
                <NavLink to="/dashboard">Dashboard</NavLink>
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
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden flex items-center">
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
        <div className="md:hidden bg-white border-b border-gray-100 py-4 px-4 space-y-2">
          {!user ? (
            <>
              <Link to="/" className="block py-2 text-gray-700" onClick={() => setIsOpen(false)}>Home</Link>
              <Link to="/about" className="block py-2 text-gray-700" onClick={() => setIsOpen(false)}>About</Link>
              <Link to="/book" className="block py-3 text-center bg-sky-600 text-white rounded-xl" onClick={() => setIsOpen(false)}>Book Appointment</Link>
              <Link to="/login" className="block py-2 text-sky-600 font-bold" onClick={() => setIsOpen(false)}>Patient Login / Register</Link>
              <Link to="/stafflogin" className="block py-2 text-gray-700 font-bold" onClick={() => setIsOpen(false)}>Staff Login</Link>
            </>
          ) : (
            <>
              <div className="py-2 border-b border-gray-50 mb-2">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Logged in as</p>
                <p className="text-sm font-bold text-gray-900">{user.name}</p>
              </div>
              <Link to="/dashboard" className="block py-2 text-gray-700" onClick={() => setIsOpen(false)}>Dashboard</Link>
              {user.role === UserRole.DOCTOR && (
                <>
                  <Link to="/dashboard/schedule" className="block py-2 text-gray-700" onClick={() => setIsOpen(false)}>My Schedule</Link>
                  <Link to="/dashboard/patients" className="block py-2 text-gray-700" onClick={() => setIsOpen(false)}>Patients</Link>
                </>
              )}
              {user.role === UserRole.ADMIN && (
                <>
                  <Link to="/dashboard/doctors" className="block py-2 text-gray-700" onClick={() => setIsOpen(false)}>Doctors</Link>
                  <Link to="/dashboard/departments" className="block py-2 text-gray-700" onClick={() => setIsOpen(false)}>Departments</Link>
                  <Link to="/dashboard/revenue" className="block py-2 text-gray-700" onClick={() => setIsOpen(false)}>Revenue</Link>
                  <Link to="/dashboard/availability" className="block py-2 text-gray-700" onClick={() => setIsOpen(false)}>Availability</Link>
                </>
              )}
              {user.role === UserRole.COUNTER && (
                <>
                  <Link to="/dashboard" className="block py-2 text-gray-700" onClick={() => setIsOpen(false)}>Counter Portal</Link>
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
