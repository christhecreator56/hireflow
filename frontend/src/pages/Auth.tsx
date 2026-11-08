import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { fieldError } from '../lib/api';
import { homeFor, useAuth, type User } from '../lib/auth';
import { Spinner } from '../components/ui';
import { AuthShell, DarkCheck, DarkError, DarkInput, primaryPill } from '../components/AuthShell';

const DEMO = [
  { email: 'employer@acme.test', role: 'Employer' },
  { email: 'recruiter@acme.test', role: 'Recruiter' },
  { email: 'manager@acme.test', role: 'Hiring manager' },
  { email: 'candidate@acme.test', role: 'Candidate' },
];
const DEMO_PASSWORD = 'Password123!';

function useAfterAuth() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  return (u: User) => {
    const next = params.get('next');
    // Only honour relative paths, and only send candidates to candidate pages.
    const safe = next?.startsWith('/') && !next.startsWith('//') && (u.role !== 'CANDIDATE' || next.startsWith('/jobs') || next.startsWith('/portal'));
    navigate(safe ? next! : homeFor(u), { replace: true });
  };
}

const Divider = ({ children }: { children: string }) => (
  <div className="my-6 flex items-center gap-4 text-xs text-white/50">
    <span className="h-px flex-1 bg-white/20" />
    {children}
    <span className="h-px flex-1 bg-white/20" />
  </div>
);

export function Login() {
  const { user, login } = useAuth();
  const after = useAfterAuth();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState<string | false>(false);
  if (user && !busy) return <Navigate to={homeFor(user)} replace />;

  const signIn = async (em: string, pw: string, who = 'form') => {
    setBusy(who);
    setError(null);
    try {
      after(await login(em, pw));
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    signIn(email, password);
  };

  return (
    <AuthShell
      word="WELCOME"
      title={
        <>
          Hello!
          <br />
          Good to see you again :)
        </>
      }
      subtitle="Log in to manage hiring or follow your applications."
    >
      <p className="mb-3 pl-1 text-xs text-white/60">One-click demo accounts</p>
      <div className="grid grid-cols-2 gap-2">
        {DEMO.map((d) => (
          <button
            key={d.email}
            type="button"
            disabled={!!busy}
            onClick={() => signIn(d.email, DEMO_PASSWORD, d.email)}
            title={`Log in as ${d.email}`}
            className="flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm text-white ring-1 ring-white/25 transition hover:bg-white/10 hover:ring-white/50 disabled:opacity-50"
          >
            {busy === d.email && <Spinner className="size-3.5" />}
            {d.role}
          </button>
        ))}
      </div>

      <Divider>Or with email</Divider>

      <form onSubmit={submit} className="space-y-4">
        <DarkError error={error} />
        <DarkInput label="Email address" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} error={fieldError(error, 'email')} />
        <DarkInput label="Password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} error={fieldError(error, 'password')} />
        <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
          <button type="submit" disabled={!!busy} className={primaryPill}>
            {busy === 'form' && <Spinner className="size-4" />}
            Log in
          </button>
          <p className="text-sm text-white/60">
            New here?{' '}
            <Link to={`/register${params.get('next') ? `?next=${encodeURIComponent(params.get('next')!)}` : ''}`} className="text-white underline underline-offset-4 hover:text-indigo-300">
              Create an account
            </Link>
          </p>
        </div>
      </form>
      <p className="mt-6 pl-1 text-xs text-white/40">Demo password for every account: {DEMO_PASSWORD}</p>
    </AuthShell>
  );
}

export function Register() {
  const { user, register } = useAuth();
  const after = useAfterAuth();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '', consent: false, talentPoolConsent: false });
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  if (user && !busy) return <Navigate to={homeFor(user)} replace />;
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const mismatch = form.confirm.length > 0 && form.confirm !== form.password;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (mismatch) return;
    setBusy(true);
    setError(null);
    try {
      const { confirm: _c, ...body } = form;
      after(await register(body));
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <AuthShell
      word="JOIN US"
      title={
        <>
          Hello!
          <br />
          We are glad to see you :)
        </>
      }
      subtitle="Create a candidate account to apply and track every step."
    >
      <form onSubmit={submit} className="space-y-4">
        <DarkError error={error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <DarkInput label="Name" autoComplete="name" required value={form.name} onChange={set('name')} error={fieldError(error, 'name')} />
          <DarkInput label="Email address" type="email" autoComplete="email" required value={form.email} onChange={set('email')} error={fieldError(error, 'email')} />
          <DarkInput
            label="Password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            placeholder="8+ characters"
            value={form.password}
            onChange={set('password')}
            error={fieldError(error, 'password')}
          />
          <DarkInput
            label="Repeat password"
            type="password"
            autoComplete="new-password"
            required
            value={form.confirm}
            onChange={set('confirm')}
            error={mismatch ? 'Passwords do not match' : undefined}
          />
        </div>
        <div className="space-y-3 pt-2">
          <DarkCheck required checked={form.consent} onChange={set('consent')} label="I agree to the processing of my personal data under the privacy policy." />
          {fieldError(error, 'consent') && <p className="pl-8 text-xs text-red-300">{fieldError(error, 'consent')}</p>}
          <DarkCheck checked={form.talentPoolConsent} onChange={set('talentPoolConsent')} label="Keep my profile in the talent pool for future openings (optional)." />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4 pt-3">
          <button type="submit" disabled={busy || mismatch} className={primaryPill}>
            {busy && <Spinner className="size-4" />}
            Sign up
          </button>
          <p className="text-sm text-white/60">
            Already registered?{' '}
            <Link to="/login" className="text-white underline underline-offset-4 hover:text-indigo-300">
              Log in
            </Link>
          </p>
        </div>
      </form>
    </AuthShell>
  );
}
