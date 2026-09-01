import Link from 'next/link';
import { CLINIC_ADDRESS, CLINIC_EMAIL, CLINIC_NAME } from '@/constants';

export default function PolicyPage({title, summary, children}: {title: string; summary: string; children: React.ReactNode}) {
  return (
    <main className="bg-white">
      <section className="bg-sky-950 px-6 py-16 text-white">
        <div className="mx-auto max-w-4xl">
          <p className="text-sm font-black uppercase tracking-[.2em] text-sky-300">{CLINIC_NAME}</p>
          <h1 className="mt-3 text-4xl font-black md:text-5xl">{title}</h1>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-sky-100">{summary}</p>
          <p className="mt-4 text-sm text-sky-300">Effective 25 August 2026 · Last updated 25 August 2026</p>
        </div>
      </section>
      <article className="prose prose-slate mx-auto max-w-4xl px-6 py-14">
        {children}
        <hr />
        <h2>Contact</h2>
        <p>For questions about this policy, appointments or payments, contact {CLINIC_NAME}:</p>
        <ul>
          <li>Email: <a href={`mailto:${CLINIC_EMAIL}`}>{CLINIC_EMAIL}</a></li>
          <li>Address: {CLINIC_ADDRESS}</li>
        </ul>
        <p><Link href="/contact">Open the contact page</Link></p>
      </article>
    </main>
  );
}
