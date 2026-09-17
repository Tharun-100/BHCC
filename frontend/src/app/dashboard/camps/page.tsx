'use client';
import AdminCamps from '@/features/dashboards/AdminCamps';
import { useAuth } from '@/providers/AuthProvider';
import { UserRole } from '@/types';
export default function Page(){const {user,isLoading}=useAuth();if(isLoading||!user||user.role!==UserRole.ADMIN)return null;return <AdminCamps/>;}
