import { useState, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router';
import { ApiError, detailLines } from '../lib/api';
import { cx } from './ui';

/** Jagged pine silhouette: stacked tiers that widen toward the base, plus a short trunk. */
function pine(x: number, base: number, h: number) {
  const w = h * 0.3;
  const tiers = 6;
  const right: string[] = [];
  const left: string[] = [];
  for (let i = 1; i <= tiers; i++) {
    const y = base - h + (h * 0.9 * i) / tiers;
    const ww = (w * i) / tiers;
    right.push(`L${x + ww} ${y}`, `L${x + ww * 0.45} ${y - h * 0.02}`);
    left.unshift(`L${x - ww * 0.45} ${y - h * 0.02}`, `L${x - ww} ${y}`);
  }
  return `M${x} ${base - h} ${right.join(' ')} L${x + 3} ${base} L${x - 3} ${base} ${left.join(' ')} Z`;
}

// Deterministic jitter so the forest looks hand-placed but renders identically every time.
const rand = (i: number) => Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1;

/** A ridge (filled to the bottom) with a row of pines along it. */
function Ridge({ y, color, count, minH, maxH, seed, wave = 18 }: { y: number; color: string; count: number; minH: number; maxH: number; seed: number; wave?: number }) {
  const ridge = (x: number) => y + Math.sin(x / 90 + seed) * wave;
  const trees = Array.from({ length: count }, (_, i) => {
    const x = (i + 0.3 + rand(seed + i) * 0.6) * (620 / count) - 10;
    return pine(x, ridge(x) + 6, minH + rand(seed * 7 + i) * (maxH - minH));
  });
  const hill = `M0 ${ridge(0)} ${Array.from({ length: 13 }, (_, i) => `L${i * 50} ${ridge(i * 50)}`).join(' ')} L600 760 L0 760 Z`;
  return (
    <g fill={color}>
      <path d={hill} />
      <path d={trees.join(' ')} />
    </g>
  );
}

/**
 * Sunset forest: pale sun over orange peaks, pine ridges fading from amber to crimson to black.
 * Uses /auth-scene.jpg instead when that file exists in frontend/public.
 * `band` = short strip anchored to the bottom (phones): no wave clip, no title.
 */
function Scene({ word, band }: { word?: string; band?: boolean }) {
  const [photo, setPhoto] = useState(true);
  const id = band ? 'band' : 'side'; // unique SVG ids: two scenes can share the page
  return (
    <svg viewBox="0 0 600 760" preserveAspectRatio={band ? 'xMidYMax slice' : 'xMidYMid slice'} className="absolute inset-0 h-full w-full" aria-hidden>
      <defs>
        <linearGradient id={`sky-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e2834f" />
          <stop offset="0.5" stopColor="#f0a466" />
          <stop offset="1" stopColor="#f6bf7f" />
        </linearGradient>
        {/* wavy right edge: the dark form panel shows through beyond it */}
        <clipPath id={`wave-${id}`}>
          <path d={band ? 'M0 0 H600 V760 H0Z' : 'M0 0 H520 C470 90 600 170 560 270 C520 370 430 410 470 520 C505 615 590 660 545 760 H0 Z'} />
        </clipPath>
      </defs>
      <g clipPath={`url(#wave-${id})`}>
        {photo ? (
          <image href="/auth-scene.jpg" width="600" height="760" preserveAspectRatio={band ? 'xMidYMax slice' : 'xMidYMid slice'} onError={() => setPhoto(false)} />
        ) : (
          <>
            <rect width="600" height="760" fill={`url(#sky-${id})`} />
            {/* faint horizontal haze bands */}
            {[120, 190, 260, 330].map((y) => (
              <rect key={y} y={y} width="600" height="10" fill="#fff" opacity="0.05" />
            ))}
            <circle cx="170" cy="160" r="96" fill="#f7d9c0" />
            <path d="M262 92 q14-12 26-2 q8-4 12 2 q10-8 24-4 q-14 2-22 8 l-6 10 q-4-8-10-8 q-12-6-24-6z" fill="#2b3240" />
            {/* mountains */}
            <path d="M0 360 L60 320 L140 345 L230 300 L290 245 L350 300 L420 280 L500 320 L600 300 V760 H0Z" fill="#f29c5e" />
            <path d="M0 420 L70 380 L130 395 L180 470 L260 430 L340 460 L600 380 V760 H0Z" fill="#ec7f4c" />
            <Ridge y={480} color="#dc5a36" count={15} minH={45} maxH={105} seed={1} />
            <Ridge y={555} color="#c43a2a" count={13} minH={60} maxH={130} seed={4} />
            <Ridge y={625} color="#a2222b" count={12} minH={75} maxH={150} seed={9} />
            <Ridge y={690} color="#6b1220" count={11} minH={85} maxH={170} seed={13} />
            <Ridge y={748} color="#140707" count={10} minH={95} maxH={200} seed={17} wave={10} />
          </>
        )}
        {word && (
          <text x="250" y="300" textAnchor="middle" fontSize="32" fontWeight="300" letterSpacing="16" fill="#fff5ec" opacity="0.92">
            {word}
          </text>
        )}
      </g>
    </svg>
  );
}

/** Full-viewport auth card: split on desktop, form-over-forest on phones. Inner panel scrolls if a form is taller than the screen. */
export function AuthShell({ word, title, subtitle, children }: { word: string; title: ReactNode; subtitle: string; children: ReactNode }) {
  const tab = ({ isActive }: { isActive: boolean }) =>
    cx('rounded-full px-5 py-1.5 text-sm transition', isActive ? 'bg-white text-slate-900' : 'text-white/70 hover:text-white');
  return (
    <div className="h-dvh p-2 sm:p-4 lg:p-6">
      <div className="flex h-full w-full flex-col overflow-hidden rounded-[28px] bg-[#1f1d1b] shadow-[0_40px_80px_-40px_rgb(27_26_24/.7)] sm:rounded-[36px] md:grid md:grid-cols-[1.05fr_1fr]">
        <div className="relative hidden md:block">
          <Scene word={word} />
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto text-white [scrollbar-width:thin]">
          <div className="my-auto w-full max-w-md self-center px-6 py-6 sm:px-10 sm:py-10 md:pl-6">
            <div className="mb-6 flex items-center justify-between gap-3 sm:mb-8">
              <Link to="/" className="flex items-center gap-2" aria-label="HireFlow home">
                <span className="grid size-8 place-items-center rounded-full bg-indigo-600">
                  <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden>
                    <path d="M17.5 8.5A6.5 6.5 0 1 0 18.5 12" />
                    <path d="M12 12l6 6" />
                  </svg>
                </span>
                <span className="font-semibold tracking-tight">HireFlow</span>
              </Link>
              <nav className="inline-flex gap-1 rounded-full bg-white/10 p-1" aria-label="Account">
                <NavLink to="/login" className={tab}>Log in</NavLink>
                <NavLink to="/register" className={tab}>Sign up</NavLink>
              </nav>
            </div>
            <h1 className="text-2xl leading-tight font-light tracking-tight sm:text-4xl">{title}</h1>
            <p className="mt-2 text-sm text-white/60">{subtitle}</p>
            <div className="mt-6 sm:mt-8">{children}</div>
            <Link to="/jobs" className="mt-6 inline-block text-xs text-white/50 hover:text-white">← Browse open jobs</Link>
          </div>
        </div>

        {/* Phones: forest strip along the bottom with a wavy top edge. */}
        <div className="relative h-40 shrink-0 sm:h-48 md:hidden">
          <Scene band />
          <svg viewBox="0 0 400 40" preserveAspectRatio="none" className="absolute inset-x-0 top-0 h-8 w-full" aria-hidden>
            <path d="M0 0 H400 V12 C330 40 260 2 190 18 C120 34 60 6 0 24Z" fill="#1f1d1b" />
          </svg>
        </div>
      </div>
    </div>
  );
}

/** Outlined pill input for the dark panel. */
export function DarkInput({ label, error, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block pl-4 text-xs text-white/70">{label}</span>
      <input
        {...props}
        className={cx(
          'block w-full rounded-full border-0 bg-white/5 px-5 py-3 text-sm text-white ring-1 ring-white/25 transition placeholder:text-white/30 focus:bg-white/10 focus:ring-2 focus:ring-indigo-400 focus:outline-none',
          error && 'ring-red-400',
        )}
      />
      {error && <span className="mt-1 block pl-4 text-xs text-red-300">{error}</span>}
    </label>
  );
}

export function DarkCheck({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 text-sm text-white/80">
      <input type="checkbox" {...props} className="peer sr-only" />
      <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-md ring-1 ring-white/40 transition peer-checked:bg-indigo-600 peer-checked:ring-indigo-600 peer-checked:[&>svg]:opacity-100 peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-300">
        <svg viewBox="0 0 16 16" className="size-3 text-white opacity-0 transition" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
          <path d="M3 8.5l3 3 7-7" />
        </svg>
      </span>
      <span>{label}</span>
    </label>
  );
}

export function DarkError({ error }: { error: unknown }) {
  if (!error) return null;
  const lines = error instanceof ApiError ? detailLines(error.details) : [];
  return (
    <div role="alert" className="rounded-2xl bg-red-500/10 px-4 py-3 text-sm text-red-200 ring-1 ring-red-400/30">
      <p>{error instanceof Error ? error.message : String(error)}</p>
      {lines.length > 0 && <ul className="mt-1 list-disc pl-5 text-xs">{lines.map((l) => <li key={l}>{l}</li>)}</ul>}
    </div>
  );
}

export const primaryPill =
  'inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#f8a488] to-[#e4472a] px-10 py-3 text-sm font-medium text-white shadow-[0_12px_30px_-12px_rgb(228_71_42/.8)] transition hover:brightness-110 disabled:opacity-60';
