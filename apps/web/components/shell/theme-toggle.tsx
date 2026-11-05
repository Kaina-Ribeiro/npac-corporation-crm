'use client';
import { useTheme } from 'next-themes';
import { ghostButton } from '@/lib/button';

export function ThemeToggle() {
  const { setTheme, resolvedTheme } = useTheme();
  return (
    <button
      type="button"
      className={`${ghostButton} h-9 px-3 whitespace-nowrap text-ink2 hover:text-ink`}
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
    >
      Alternar tema
    </button>
  );
}
