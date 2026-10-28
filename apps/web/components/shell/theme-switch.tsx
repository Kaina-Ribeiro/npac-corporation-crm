'use client';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

const OPTIONS = [
  ['light', 'Claro'],
  ['dark', 'Escuro'],
  ['system', 'Automático'],
] as const;

/** Seletor segmentado de tema (tela Mais, no celular). */
export function ThemeSwitch() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <div
      role="radiogroup"
      aria-label="Tema"
      className="grid grid-cols-3 gap-1 rounded-2xl bg-black/5 p-1 dark:bg-white/10"
    >
      {OPTIONS.map(([value, label]) => {
        const on = mounted && (theme ?? 'system') === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => setTheme(value)}
            className={`min-h-11 rounded-xl text-sm font-semibold transition-all ${
              on ? 'bg-[var(--on)] text-ink shadow-[0_2px_10px_rgba(0,0,0,.08)]' : 'text-ink2'
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
