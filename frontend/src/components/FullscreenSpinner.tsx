
import React from 'react';
import { Loader2 } from 'lucide-react';

export const FullscreenSpinner: React.FC = () => {
  return (
    <div className="fixed inset-0 bg-white bg-opacity-80 flex items-center justify-center z-50">
      <Loader2 className="animate-spin text-sky-500" size={64} />
    </div>
  );
};
