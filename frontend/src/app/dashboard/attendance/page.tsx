'use client';
import AttendanceDashboard from '@/features/dashboards/AttendanceDashboard';
import { useAuth } from '@/providers/AuthProvider';
import { useRouter } from 'next/navigation';
import React from 'react';
export default function Page(){const {user,isLoading}=useAuth();const router=useRouter();React.useEffect(()=>{if(!isLoading&&!user)router.replace('/stafflogin?next=/dashboard/attendance');},[isLoading,user,router]);if(isLoading||!user)return null;return <AttendanceDashboard user={user}/>;}
