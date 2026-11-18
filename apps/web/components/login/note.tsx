import type { ReactNode } from 'react';

/** Aviso com o escudo no pé do cartão das telas de entrada. */
export function Note({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 border-t-[0.5px] border-[rgba(60,60,67,.2)] pt-3.5 text-xs leading-relaxed text-[#333336]">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
        className="mt-px h-[15px] w-[15px] flex-none text-gold-deep"
      >
        <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />
      </svg>
      <span>{children}</span>
    </div>
  );
}
