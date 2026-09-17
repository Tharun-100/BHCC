'use client';
import PayrollDashboard from '@/features/dashboards/PayrollDashboard';
import { useAuth } from '@/providers/AuthProvider';
export default function Page(){const {user,isLoading}=useAuth();if(isLoading||!user)return null;return <PayrollDashboard user={user}/>;}
