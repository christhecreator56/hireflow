import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useAuth, type Role } from '../lib/auth';
import { label } from '../lib/format';
import { Logo } from './PublicLayout';
import { cx } from './ui';
import { ThemeToggle } from './ThemeToggle';

const ALL: Role[] = ['EMPLOYER', 'RECRUITER', 'HIRING_MANAGER'];
type Item = { to: string; label: string; roles: Role[]; icon: string; primary?: boolean };
const NAV: Item[] = [
  { to: '/dashboard', label: 'Overview', roles: ALL, primary: true, icon: 'M3 13h8V3H3zm0 8h8v-6H3zm10 0h8V11h-8zm0-18v6h8V3z' },
  { to: '/jobs-admin', label: 'Vacancies', roles: ALL, primary: true, icon: 'M10 4h4a2 2 0 0 1 2 2v1h4v12H4V7h4V6a2 2 0 0 1 2-2m0 3h4V6h-4z' },
  { to: '/interviews', label: 'Interviews', roles: ALL, primary: true, icon: 'M7 2v2H5a2 2 0 0 0-2 2v14h18V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2zm-2 8h14v8H5z' },
  { to: '/approvals', label: 'Approvals', roles: ALL, primary: true, icon: 'M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z' },
  { to: '/templates', label: 'Email templates', roles: ['EMPLOYER', 'RECRUITER'], icon: 'M3 5h18v14H3zm2 2v.5l7 4.5 7-4.5V7z' },
  { to: '/audit', label: 'Audit log', roles: ['EMPLOYER', 'RECRUITER'], icon: 'M5 3h10l4 4v14H5zm2 6v2h10V9zm0 4v2h10v-2zm0 4v2h7v-2z' },
  { to: '/governance', label: 'Data governance', roles: ['EMPLOYER'], icon: 'M12 2 4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5z' },
  { to: '/users', label: 'Team', roles: ['EMPLOYER'], icon: 'M16 11a3 3 0 1 0-3-3 3 3 0 0 0 3 3m-8 0a3 3 0 1 0-3-3 3 3 0 0 0 3 3m0 2c-2.3 0-7 1.2-7 3.5V19h14v-2.5C15 14.2 10.3 13 8 13m8 0c-.3 0-.6 0-1 .1a4.2 4.2 0 0 1 2 3.4V19h6v-2.5c0-2.3-4.7-3.5-7-3.5' },
];

const Icon = ({ d, className = 'size-4' }: { d: string; className?: string }) => (
  <svg viewBox="0 0 24 24" className={cx('shrink-0 fill-current', className)} aria-hidden>
    <path d={d} />
  </svg>
);

export const initials = (name: string) =>
  name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

export function StaffLayout() {
  const { user, org, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => setOpen(false), [location.pathname]);
  if (!user) return null;
  const items = NAV.filter((n) => n.roles.includes(user.role));
  const primary = items.filter((n) => n.primary);
  const tools = items.filter((n) => !n.primary);
  const signOut = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 px-4 pt-4 sm:px-6 lg:px-10 lg:pt-6">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-3">
          <div className="flex items-center gap-1 rounded-full bg-white/50 p-1 backdrop-blur">
            <Logo compact />
            <span title={`${user.name} · ${label(user.role)}`} className="grid size-9 place-items-center rounded-full bg-slate-900 text-xs font-semibold text-white">
              {initials(user.name)}
            </span>
          </div>

          <nav aria-label="Main" className="hidden items-center gap-1 rounded-full bg-white/40 p-1 backdrop-blur lg:flex">
            {primary.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) =>
                  cx('rounded-full px-5 py-2 text-sm transition', isActive ? 'bg-black/10 text-slate-900' : 'text-slate-700 hover:text-slate-900')
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>

          <div className="hidden items-center gap-1 rounded-full bg-white/40 p-1 backdrop-blur lg:flex">
            <ThemeToggle />
            <span className="px-3 text-sm text-slate-700">{org?.name}</span>
            <button type="button" onClick={signOut} className="rounded-full bg-white px-5 py-2 text-sm text-slate-900 shadow-[0_6px_16px_-10px_rgb(27_26_24/.4)] hover:bg-slate-50">
              Log out
            </button>
          </div>

          <div className="flex items-center gap-1 lg:hidden">
            <ThemeToggle className="bg-white/60 backdrop-blur" />
          <button type="button" aria-label="Open menu" onClick={() => setOpen(true)} className="grid size-11 place-items-center rounded-full bg-white/60 text-slate-700 backdrop-blur lg:hidden">
            <Icon d="M3 6h18v2H3zm0 5h18v2H3zm0 5h18v2H3z" className="size-5" />
          </button>
          </div>
        </div>
      </header>

      {/* Floating icon rail for secondary tools (desktop). */}
      {tools.length > 0 && (
        <aside aria-label="Tools" className="fixed top-1/2 left-4 z-20 hidden -translate-y-1/2 flex-col gap-2 lg:left-6 lg:flex">
          {tools.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              title={n.label}
              aria-label={n.label}
              className={({ isActive }) =>
                cx('group relative grid size-11 place-items-center rounded-full transition', isActive ? 'bg-slate-900 text-white' : 'bg-white/50 text-slate-700 backdrop-blur hover:bg-white')
              }
            >
              <Icon d={n.icon} />
              <span className="pointer-events-none absolute left-full ml-3 rounded-full bg-slate-900 px-3 py-1 text-xs whitespace-nowrap text-white opacity-0 transition group-hover:opacity-100">
                {n.label}
              </span>
            </NavLink>
          ))}
        </aside>
      )}

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-3 right-3 flex w-72 flex-col fade-in rounded-[28px] bg-[var(--panel)] p-4 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <Logo />
              <button type="button" aria-label="Close menu" onClick={() => setOpen(false)} className="grid size-9 place-items-center rounded-full bg-black/5 text-slate-500">
                ✕
              </button>
            </div>
            <nav className="flex flex-1 flex-col gap-1">
              {items.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  className={({ isActive }) => cx('flex items-center gap-3 rounded-full px-4 py-2.5 text-sm', isActive ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-black/5')}
                >
                  <Icon d={n.icon} />
                  {n.label}
                </NavLink>
              ))}
            </nav>
            <div className="mt-4 rounded-3xl bg-white/70 p-4">
              <p className="truncate text-sm font-medium text-slate-900">{user.name}</p>
              <p className="truncate text-xs text-slate-500">
                {label(user.role)} · {org?.name}
              </p>
              <button type="button" onClick={signOut} className="mt-3 w-full rounded-full bg-slate-900 py-2 text-sm text-white">
                Log out
              </button>
            </div>
          </aside>
        </div>
      )}

      <main key={location.pathname} className="page-enter mx-auto max-w-[1400px] min-w-0 px-4 py-8 sm:px-6 lg:px-24 lg:py-10">
        <Outlet />
      </main>
    </div>
  );
}
