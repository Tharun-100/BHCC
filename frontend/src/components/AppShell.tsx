'use client';

import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { useAuth } from '@/providers/AuthProvider';
import { usePathname } from 'next/navigation';
import { UserRole } from '@/types';
import AdminSidebar from '@/components/AdminSidebar';

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const showAdminSidebar = user?.role === UserRole.ADMIN && pathname.startsWith('/dashboard');
  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <Navbar user={user} onLogout={logout} />
      <main className={`flex-grow ${showAdminSidebar ? 'flex flex-col lg:flex-row' : ''}`}>
        {showAdminSidebar && <AdminSidebar />}
        <div className={showAdminSidebar ? 'min-w-0 flex-1' : undefined}>{children}</div>
      </main>
      <Footer />
    </div>
  );
}
