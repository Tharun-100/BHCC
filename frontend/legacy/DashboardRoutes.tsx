
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import PatientDashboard from './pages/dashboards/PatientDashboard';
import DoctorDashboard from './pages/dashboards/DoctorDashboard';
import DoctorSchedule from './pages/dashboards/DoctorSchedule';
import DoctorPatients from './pages/dashboards/DoctorPatients';
import AdminDashboard from './pages/dashboards/AdminDashboard';
import AdminDoctors from './pages/dashboards/AdminDoctors';
import AdminRevenue from './pages/dashboards/AdminRevenue';
import AdminAvailability from './pages/dashboards/AdminAvailability';
import AdminDepartments from './pages/dashboards/AdminDepartments';
import CounterDashboard from './pages/dashboards/CounterDashboard';
import { User, UserRole } from './types';

interface DashboardRoutesProps {
  user: User | null;
}

const DashboardRoutes: React.FC<DashboardRoutesProps> = ({ user }) => {
  if (!user) {
    return <Navigate to="/login" />;
  }

  return (
    <Routes>
      {user.role === UserRole.PATIENT && (
        <Route index element={<PatientDashboard user={user} />} />
      )}
      
      {user.role === UserRole.DOCTOR && (
        <>
          <Route index element={<DoctorDashboard user={user} />} />
          <Route path="schedule" element={<DoctorSchedule user={user} />} />
          <Route path="patients" element={<DoctorPatients user={user} />} />
        </>
      )}
      
      {user.role === UserRole.ADMIN && (
        <>
          <Route index element={<AdminDashboard user={user} />} />
          <Route path="doctors" element={<AdminDoctors user={user} />} />
          <Route path="departments" element={<AdminDepartments />} />
          <Route path="revenue" element={<AdminRevenue user={user} />} />
          <Route path="availability" element={<AdminAvailability user={user} />} />
        </>
      )}
      
      {user.role === UserRole.COUNTER && (
        <Route index element={<CounterDashboard user={user} />} />
      )}
      
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
};

export default DashboardRoutes;
