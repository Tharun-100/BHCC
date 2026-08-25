'use client';
import ServiceReportingPortal from '@/features/ServiceReportingPortal';
import { useRouter } from 'next/navigation';
import React from 'react';
import { getReportingAccessToken } from '@/lib/reportingStorage';

export default function Page(){
  const router=useRouter(); const [ready,setReady]=React.useState(false);
  React.useEffect(()=>{if(!getReportingAccessToken())router.replace('/service-reporting/login');else setReady(true);},[router]);
  if(!ready)return null;
  return <ServiceReportingPortal/>;
}
