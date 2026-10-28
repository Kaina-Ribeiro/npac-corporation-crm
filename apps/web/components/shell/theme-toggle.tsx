'use client';
import { useTheme } from 'next-themes';

export function ThemeToggle() {
  const { setTheme, resolvedTheme } = useTheme();
  return (
    <button
      type="button"
      className="h-9 rounded-full px-3 text-sm whitespace-nowrap text-ink2 transition-colors hover:bg-black/5 hover:text-ink"
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
    >
      Alternar tema
    </button>
  );
}
