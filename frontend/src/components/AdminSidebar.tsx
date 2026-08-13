'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, CalendarClock, ClipboardList, ContactRound, FolderCog, IndianRupee, ShieldCheck, Stethoscope, UsersRound } from 'lucide-react';

const groups = [
  {
    label: 'People',
    links: [
      { href: '/dashboard/doctors', label: 'Doctors', icon: Stethoscope },
      { href: '/dashboard/staff', label: 'Staff', icon: UsersRound },
      { href: '/dashboard/profiles', label: 'All Profiles', icon: ContactRound },
    ],
  },
  {
    label: 'Clinical Operations',
    links: [
      { href: '/dashboard/prescriptions', label: 'Prescriptions', icon: ClipboardList },
      { href: '/dashboard/departments', label: 'Departments', icon: FolderCog },
      { href: '/dashboard/availability', label: 'Doctor Availability', icon: CalendarClock },
      { href: '/dashboard/attendance', label: 'Attendance & Leave', icon: Activity },
    ],
  },
  {
    label: 'Finance & Governance',
    links: [
      { href: '/dashboard/revenue', label: 'Revenue', icon: IndianRupee },
      { href: '/dashboard/operations', label: 'Operations & Audit', icon: ShieldCheck },
    ],
  },
];

export default function AdminSidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-full shrink-0 border-b border-slate-200 bg-slate-950 text-white lg:min-h-[calc(100vh-7rem)] lg:w-72 lg:border-b-0 lg:border-r lg:border-slate-800">
      <div className="sticky top-28 p-4 lg:p-6">
        <div className="mb-5 hidden lg:block">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-sky-400">Administration</p>
          <p className="mt-1 text-sm text-slate-400">Clinic management tools</p>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-1 lg:block lg:space-y-6 lg:overflow-visible">
          {groups.map((group) => (
            <section key={group.label} className="min-w-max lg:min-w-0">
              <h2 className="mb-2 px-3 text-[11px] font-black uppercase tracking-widest text-slate-500">{group.label}</h2>
              <div className="flex gap-1 lg:block lg:space-y-1">
                {group.links.map(({ href, label, icon: Icon }) => {
                  const active = pathname === href;
                  return <Link key={href} href={href} aria-current={active ? 'page' : undefined} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition ${active ? 'bg-sky-600 text-white shadow-lg shadow-sky-950/30' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}><Icon size={18} /><span>{label}</span></Link>;
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </aside>
  );
}
