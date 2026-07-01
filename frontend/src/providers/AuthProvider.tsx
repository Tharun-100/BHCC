'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { User } from '@/types';
import { clearTokens, getAccessToken } from '@/lib/storage';
import { getCurrentUserProfile, logoutUser } from '@/services/authService';

type AuthContextValue = {
  user: User | null;
  isLoading: boolean;
  refreshUser: () => Promise<void>;
  logout: () => Promise<void>;
  setUser: React.Dispatch<React.SetStateAction<User | null>>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      setUser(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const profile = await getCurrentUserProfile();
      setUser(profile);
    } catch {
      clearTokens();
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutUser();
    } finally {
      clearTokens();
      setUser(null);
    }
  }, []);

  useEffect(() => {
    // Attempt auto-login on first client render.
    refreshUser().catch(() => null);
  }, [refreshUser]);

  const value = useMemo<AuthContextValue>(() => ({ user, isLoading, refreshUser, logout, setUser }), [
    user,
    isLoading,
    refreshUser,
    logout
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
