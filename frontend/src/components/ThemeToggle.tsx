import { useState } from 'react';
import { cx } from './ui';

type Theme = 'light' | 'dark';
const current = (): Theme => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');

/** Sun/moon switch. The initial theme is applied by an inline script in index.html (no flash). */
export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>(current);
  const flip = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    const root = document.documentElement;
    root.classList.add('theme-swap');
    root.dataset.theme = next;
    try {
      localStorage.setItem('theme', next);
    } catch {
      // storage blocked: theme still applies for this visit
    }
    setTimeout(() => root.classList.remove('theme-swap'), 400);
    setTheme(next);
  };
  const dark = theme === 'dark';
  return (
    <button
      type="button"
      onClick={flip}
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={dark ? 'Light theme' : 'Dark theme'}
      className={cx('grid size-9 place-items-center rounded-full text-slate-700 transition hover:bg-black/5 hover:text-slate-900', className)}
    >
      <svg viewBox="0 0 24 24" className={cx('size-[18px] transition-transform duration-500', dark ? 'rotate-0' : '-rotate-90')} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
        {dark ? (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </>
        ) : (
          <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
        )}
      </svg>
    </button>
  );
}
