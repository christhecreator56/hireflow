import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { api, ApiError } from './api';

export type Role = 'EMPLOYER' | 'RECRUITER' | 'HIRING_MANAGER' | 'CANDIDATE';
export type User = { id: string; role: Role; orgId: string | null; name: string; email: string };
export type Org = { id: string; name: string; retentionDays: number } | null;

type Ctx = {
  user: User | null;
  org: Org;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (body: Record<string, unknown>) => Promise<User>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<Ctx | null>(null);
export const STAFF: Role[] = ['EMPLOYER', 'RECRUITER', 'HIRING_MANAGER'];
export const homeFor = (u: User) => (u.role === 'CANDIDATE' ? '/portal' : '/dashboard');

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [org, setOrg] = useState<Org>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const r = await api<{ user: User; org: Org }>('/auth/me');
      setUser(r.user);
      setOrg(r.org);
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 401) console.error(e);
      setUser(null);
      setOrg(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = async (email: string, password: string) => {
    const r = await api<{ user: User }>('/auth/login', { body: { email, password } });
    await refresh();
    return r.user;
  };
  const register = async (body: Record<string, unknown>) => {
    const r = await api<{ user: User }>('/auth/register', { body });
    await refresh();
    return r.user;
  };
  const logout = async () => {
    await api('/auth/logout', { method: 'POST' });
    setUser(null);
    setOrg(null);
  };

  return <AuthContext.Provider value={{ user, org, loading, login, register, logout, refresh }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}

/** Route guard: unauthenticated → /login (with return path); wrong role → own home. */
export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="p-10 text-center text-sm text-slate-500">Loading…</div>;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  if (!roles.includes(user.role)) return <Navigate to={homeFor(user)} replace />;
  return <>{children}</>;
}
