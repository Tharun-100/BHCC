
import React, { useState, useEffect } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';

// UI Components
import Navbar from './components/Navbar';
import Footer from './components/Footer';

// Page Components
import Home from './pages/Home';
import About from './pages/About';
import DepartmentsPage from './pages/DepartmentsPage';
import BookAppointment from './pages/BookAppointment';
import FeedbackPage from './pages/FeedbackPage';
import Contact from './pages/Contact';
import Login from './pages/Login';
import StaffLogin from './pages/StaffLogin';
import EnforceMfaPage from './pages/EnforceMfaPage';
import PaymentGatewayPage from './pages/PaymentGatewayPage';
import PaymentCallbackPage from './pages/PaymentCallbackPage';

// Routing & Auth
import DashboardRoutes from './DashboardRoutes';
import ProtectedRoute from './ProtectedRoute';

// Services & Types
import { User, UserRole } from './types';
import { auth } from './firebase';
import { getCurrentUserProfile, logoutUser } from './services/authService';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const handleLogin = (nextUser: User) => setUser(nextUser);

  const handleLogout = async () => {
    await logoutUser();
    setUser(null);
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const userProfile = await getCurrentUserProfile();
          setUser(userProfile);
        } catch (error) {
          // User is authenticated in Firebase, but we couldn't get profile.
          // This could happen, log them out.
          await logoutUser();
          setUser(null);
        }
      } else {
        setUser(null);
      }
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (authLoading) {
    // You might want a proper loading spinner component here
    return <div className="min-h-screen bg-gray-50" />;
  }

  return (
    <Router>
      <div className="flex flex-col min-h-screen bg-gray-50">
        <Navbar user={user} onLogout={handleLogout} />
        
        <main className="flex-grow">
          <Routes>
            {/* Public Routes */}
            <Route path="/" element={<Home />} />
            <Route path="/about" element={<About />} />
            <Route path="/departments" element={<DepartmentsPage />} />
            <Route path="/feedback" element={<FeedbackPage user={user} />} />
            <Route path="/contact" element={<Contact user={user} />} />
            
            {/* Login Route */}
            <Route path="/login" element={user ? <Navigate to="/dashboard" /> : <Login onLogin={handleLogin} />} />
            <Route path="/stafflogin" element={user ? <Navigate to="/dashboard" /> : <StaffLogin onLogin={handleLogin} />} />
            
            {/* Protected Booking Route (Only for Patients) */}
            <Route 
              path="/book" 
              element={
                <ProtectedRoute user={user} allowedRoles={[UserRole.PATIENT]}>
                  <BookAppointment user={user} />
                </ProtectedRoute>
              } 
            />

            {/* Dashboard Routes (Handled by DashboardRoutes component) */}
            <Route 
              path="/dashboard/*" 
              element={
                <ProtectedRoute user={user} allowedRoles={[UserRole.ADMIN, UserRole.COUNTER, UserRole.DOCTOR, UserRole.PATIENT]}>
                  <DashboardRoutes user={user} />
                </ProtectedRoute>
              } 
            />

            {/* Payment flow routes (Patient only) */}
            <Route
              path="/payment-gateway"
              element={
                <ProtectedRoute user={user} allowedRoles={[UserRole.PATIENT]}>
                  <PaymentGatewayPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/payment-callback"
              element={
                <ProtectedRoute user={user} allowedRoles={[UserRole.PATIENT]}>
                  <PaymentCallbackPage />
                </ProtectedRoute>
              }
            />

            {/* MFA enrollment route for ADMINs before dashboard access */}
            <Route
              path="/enforce-mfa"
              element={
                !user ? (
                  <Navigate to="/login" replace />
                ) : user.role !== UserRole.ADMIN ? (
                  <Navigate to="/dashboard" replace />
                ) : (
                  <EnforceMfaPage />
                )
              }
            />

            {/* Fallback Route */}
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </main>

        <Footer />
      </div>
    </Router>
  );
};

export default App;
