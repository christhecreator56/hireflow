import { NavLink, Route, Routes } from 'react-router';
import { useAuth } from '../../lib/auth';
import { cx } from '../../components/ui';
import { MyApplications } from './MyApplications';
import { Profile } from './Profile';
import { Notifications } from './Notifications';
import { Privacy } from './Privacy';

const TABS = [
  { to: '/portal', label: 'Applications', end: true },
  { to: '/portal/profile', label: 'Profile & resumes' },
  { to: '/portal/notifications', label: 'Notifications' },
  { to: '/portal/privacy', label: 'Privacy & data' },
];

export function Portal() {
  const { user } = useAuth();
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Hi, {user?.name.split(' ')[0]}</h1>
      <p className="mt-1 text-sm text-slate-500">Track your applications and manage your data.</p>
      <nav className="mt-5 mb-6 flex gap-1 overflow-x-auto border-b border-slate-200">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              cx('-mb-px border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap', isActive ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800')
            }
          >
            {t.label}
          </NavLink>
        ))}
      </nav>
      <Routes>
        <Route index element={<MyApplications />} />
        <Route path="profile" element={<Profile />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="privacy" element={<Privacy />} />
      </Routes>
    </div>
  );
}
