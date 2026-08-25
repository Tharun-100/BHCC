'use client';
import PasswordInput from '@/components/PasswordInput';
import { getReportingAccessToken } from '@/lib/reportingStorage';
import { loginToReporting } from '@/services/reportingService';
import { useRouter } from 'next/navigation';
import React from 'react';

export default function ReportingLogin(){
 const router=useRouter(),[email,setEmail]=React.useState(''),[password,setPassword]=React.useState(''),[error,setError]=React.useState(''),[loading,setLoading]=React.useState(false);
 React.useEffect(()=>{if(getReportingAccessToken())router.replace('/service-reporting');},[router]);
 const submit=async(e:React.FormEvent)=>{e.preventDefault();setLoading(true);setError('');try{await loginToReporting(email,password);router.replace('/service-reporting');}catch(x){setError(x instanceof Error?x.message:'Could not sign in.');}finally{setLoading(false);}};
 return <main className="flex min-h-screen items-center justify-center bg-slate-950 p-5"><div className="w-full max-w-md rounded-3xl bg-white p-7 shadow-2xl"><p className="font-black uppercase tracking-widest text-sky-600">BHCC Group Management</p><h1 className="mt-2 text-3xl font-black">Service reporting login</h1><p className="mt-2 text-gray-500">This portal is separate from patient and clinic administration.</p>{error&&<p className="mt-5 rounded-xl bg-red-50 p-3 text-red-700">{error}</p>}<form onSubmit={submit} className="mt-6 space-y-4"><label className="block font-bold">Email<input type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)} className="mt-2 w-full rounded-xl border p-3 font-normal"/></label><label className="block font-bold">Password<PasswordInput autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)} className="mt-2 w-full rounded-xl border p-3 font-normal"/></label><button disabled={loading} className="w-full rounded-xl bg-sky-600 p-3 font-black text-white disabled:opacity-50">{loading?'Signing in…':'Sign in to reporting'}</button></form><a href="/" className="mt-5 block text-center font-bold text-gray-500">Return to healthcare website</a></div></main>;
}
