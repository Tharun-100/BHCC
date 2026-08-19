'use client';

import React from 'react';
import { Camera, Trash2 } from 'lucide-react';

export default function ProfilePhotoField({ value, name, onChange }: { value?: string; name: string; onChange: (value: string) => void }) {
  const [error, setError] = React.useState('');
  const select = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setError('Choose a JPEG, PNG, or WebP image.'); return; }
    if (file.size > 500_000) { setError('Choose an image smaller than 500 KB.'); return; }
    const reader = new FileReader(); reader.onload = () => { onChange(String(reader.result || '')); setError(''); }; reader.readAsDataURL(file);
  };
  return <div className="flex flex-col gap-3 sm:flex-row sm:items-center"><div className="h-24 w-24 shrink-0 overflow-hidden rounded-3xl bg-sky-100 text-sky-700 flex items-center justify-center text-3xl font-black">{value ? <img src={value} alt={`${name} profile`} className="h-full w-full object-cover" /> : name.charAt(0).toUpperCase()}</div><div><label className="inline-flex cursor-pointer items-center rounded-xl bg-sky-600 px-4 py-2 font-bold text-white"><Camera size={17} className="mr-2" />Choose photo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={select} className="sr-only" /></label>{value && <button type="button" onClick={() => onChange('')} className="ml-3 inline-flex items-center font-bold text-red-600"><Trash2 size={16} className="mr-1" />Remove</button>}<p className="mt-2 text-xs text-gray-500">JPEG, PNG or WebP; maximum 500 KB.</p>{error && <p className="mt-1 text-sm font-semibold text-red-600">{error}</p>}</div></div>;
}
