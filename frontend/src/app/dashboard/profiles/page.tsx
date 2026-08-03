'use client';
import AdminProfiles from '@/features/dashboards/AdminProfiles';import {useAuth} from '@/providers/AuthProvider';import {UserRole} from '@/types';import {useRouter} from 'next/navigation';import React from 'react';
export default function Page(){const{user,isLoading}=useAuth();const router=useRouter();React.useEffect(()=>{if(!isLoading&&(!user||user.role!==UserRole.ADMIN))router.replace('/stafflogin?role=ADMIN&next=/dashboard/profiles');},[isLoading,user,router]);if(isLoading||!user||user.role!==UserRole.ADMIN)return null;return <AdminProfiles currentUserId={user.id}/>;}
