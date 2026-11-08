import { Link, NavLink, Outlet, useNavigate } from 'react-router';
import { homeFor, useAuth } from '../lib/auth';
import { cx } from './ui';

/** Coral mark: a ring with a tail, echoing the match rings used across the app. */
export const Logo = ({ compact }: { compact?: boolean }) => (
  <Link to="/" className="flex items-center gap-2 text-slate-900" aria-label="HireFlow home">
    <span className="grid size-9 place-items-center rounded-full bg-indigo-600 text-white">
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden>
        <path d="M17.5 8.5A6.5 6.5 0 1 0 18.5 12" />
        <path d="M12 12l6 6" />
      </svg>
    </span>
    {!compact && <span className="text-lg font-semibold tracking-tight">HireFlow</span>}
  </Link>
);

export function PublicLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const link = ({ isActive }: { isActive: boolean }) =>
    cx('whitespace-nowrap rounded-full px-3 py-2 text-sm transition sm:px-5', isActive ? 'bg-black/10 text-slate-900' : 'text-slate-700 hover:text-slate-900');
  const pill = 'whitespace-nowrap rounded-full bg-white px-4 py-2 text-sm text-slate-900 shadow-[0_6px_16px_-10px_rgb(27_26_24/.4)] sm:px-5';
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 px-4 pt-4 sm:px-6 lg:pt-6">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div className="rounded-full bg-white/50 p-1 backdrop-blur sm:pr-4">
            <Logo />
          </div>
          <nav className="flex items-center gap-1 rounded-full bg-white/40 p-1 backdrop-blur">
            <NavLink to="/jobs" end className={link}>Jobs</NavLink>
            {user ? (
              <>
                <NavLink to={homeFor(user)} className={link}>{user.role === 'CANDIDATE' ? 'Portal' : 'Dashboard'}</NavLink>
                <button
                  type="button"
                  className={pill}
                  onClick={async () => {
                    await logout();
                    navigate('/jobs');
                  }}
                >
                  Log out
                </button>
              </>
            ) : (
              <>
                <NavLink to="/login" className={link}>Log in</NavLink>
                <Link to="/register" className={pill}>Sign up</Link>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}
