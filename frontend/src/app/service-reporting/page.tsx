'use client';
import ServiceReportingPortal from '@/features/ServiceReportingPortal';
import { useAuth } from '@/providers/AuthProvider';
import { useRouter } from 'next/navigation';
import React from 'react';

export default function Page(){
  const {user,isLoading}=useAuth(); const router=useRouter();
  React.useEffect(()=>{if(!isLoading&&!user)router.replace('/login?next=/service-reporting');},[isLoading,user,router]);
  if(isLoading||!user)return null;
  return <ServiceReportingPortal/>;
}
