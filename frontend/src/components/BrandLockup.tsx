import { CLINIC_NAME } from '../constants';

type BrandLockupProps = {
  inverse?: boolean;
};

export function BrandLockup({ inverse = false }: BrandLockupProps) {
  return (
    <div className="flex items-center gap-3 sm:gap-4">
      <img
        src="/bhcc-logo.png"
        alt={CLINIC_NAME}
        className="w-16 h-16 sm:w-20 sm:h-20 object-contain shrink-0"
      />
      <div className="w-[210px] sm:w-[280px] min-w-0">
        <div className="w-fit">
          <div
            className={`text-lg sm:text-2xl font-bold leading-none ${inverse ? 'text-white' : 'text-sky-900'}`}
            style={{ fontFamily: 'Georgia, Times New Roman, serif' }}
          >
            BHAKTIVEDANTA
          </div>
          <div className={`h-px my-2 w-full ${inverse ? 'bg-gray-600' : 'bg-sky-800'}`} />
        </div>
        <div
          className={`text-sm sm:text-lg font-bold leading-none ${inverse ? 'text-gray-200' : 'text-sky-900'}`}
          style={{ fontFamily: 'Georgia, Times New Roman, serif' }}
        >
          HEALTH CARE CENTER
        </div>
      </div>
    </div>
  );
}
