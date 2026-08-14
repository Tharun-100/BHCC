'use client';

import React from 'react';
import { Eye, EyeOff } from 'lucide-react';

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>;

export default function PasswordInput({ className = '', ...props }: Props) {
  const [visible, setVisible] = React.useState(false);
  return (
    <div className="relative w-full">
      <input {...props} type={visible ? 'text' : 'password'} className={`${className} w-full pr-12`} />
      <button type="button" onClick={() => setVisible((value) => !value)} aria-label={visible ? 'Hide password' : 'Show password'} aria-pressed={visible} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500">
        {visible ? <EyeOff size={19} /> : <Eye size={19} />}
      </button>
    </div>
  );
}
