'use client';
import { useTheme } from 'next-themes';

export function ThemeToggle() {
  const { setTheme, theme } = useTheme();
  return (
    <button
      type="button"
      className="rounded-full px-3 py-2 text-sm text-ink2"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
    >
      Alternar tema
    </button>
  );
}
