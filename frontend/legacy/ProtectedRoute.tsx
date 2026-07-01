
import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { getAuth, multiFactor } from 'firebase/auth';
import { User, UserRole } from './types';
import { FullscreenSpinner } from './components/FullscreenSpinner';

interface ProtectedRouteProps {
  user: User | null;
  allowedRoles: UserRole[];
  children: React.ReactElement;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ user, allowedRoles, children }) => {
  const location = useLocation();
  const auth = getAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [isMfaCompliant, setIsMfaCompliant] = useState(false);

  useEffect(() => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    if (!import.meta.env.PROD) {
      setIsMfaCompliant(true);
      setIsLoading(false);
      return;
    }

    // MFA check is only required for ADMINs for now.
    if (user.role !== UserRole.ADMIN) {
      setIsMfaCompliant(true);
      setIsLoading(false);
      return;
    }

    const checkMfaStatus = async () => {
      if (auth.currentUser) {
        const enrolledFactors = multiFactor(auth.currentUser).enrolledFactors;
        // If the admin has at least one second factor enrolled, they are compliant.
        if (enrolledFactors && enrolledFactors.length > 0) {
          setIsMfaCompliant(true);
        }
      }
      setIsLoading(false);
    };

    checkMfaStatus();
  }, [user, auth.currentUser]);

  if (isLoading) {
    return <FullscreenSpinner />;
  }

  // 1. Check for authenticated user
  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  // 2. Check if the user's role is allowed for this route
  if (!allowedRoles.includes(user.role)) {
    // If not allowed, redirect them to their default dashboard.
    // This prevents a patient from trying to access /admin, for example.
    return <Navigate to="/dashboard" replace />;
  }

  // 3. For ADMINs, enforce MFA enrollment
  if (user.role === UserRole.ADMIN && !isMfaCompliant) {
    // Redirect to MFA setup page if they are not compliant.
    return <Navigate to="/enforce-mfa" replace />;
  }

  // 4. If all checks pass, render the protected component
  return children;
};

export default ProtectedRoute;
