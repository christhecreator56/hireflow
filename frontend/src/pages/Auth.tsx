import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { fieldError } from '../lib/api';
import { homeFor, useAuth, type User } from '../lib/auth';
import { Button, Card, Checkbox, ErrorBox, Input } from '../components/ui';

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

export function Login() {
  const { user, login } = useAuth();
  const after = useAfterAuth();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  if (user && !busy) return <Navigate to={homeFor(user)} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      after(await login(email, password));
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight text-slate-900">Welcome back</h1>
      <p className="mb-6 text-sm text-slate-500">Log in to manage hiring or track your applications.</p>
      <Card>
        <form onSubmit={submit} className="space-y-4">
          <ErrorBox error={error} />
          <Input label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} error={fieldError(error, 'email')} />
          <Input label="Password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} error={fieldError(error, 'password')} />
          <Button type="submit" className="w-full" loading={busy}>
            Log in
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-500">
          New candidate?{' '}
          <Link to={`/register${params.get('next') ? `?next=${encodeURIComponent(params.get('next')!)}` : ''}`} className="font-medium text-indigo-600 hover:underline">
            Create an account
          </Link>
        </p>
      </Card>
      <div className="mt-6 rounded-xl bg-indigo-50/60 p-4 ring-1 ring-indigo-100">
        <p className="mb-2 text-xs font-semibold tracking-wide text-indigo-900 uppercase">Demo accounts</p>
        <div className="grid grid-cols-2 gap-2">
          {DEMO.map((d) => (
            <button
              key={d.email}
              type="button"
              onClick={() => {
                setEmail(d.email);
                setPassword(DEMO_PASSWORD);
              }}
              className="rounded-lg bg-white px-3 py-2 text-left text-sm shadow-sm ring-1 ring-slate-200 hover:ring-indigo-300"
            >
              <span className="block font-medium text-slate-900">{d.role}</span>
              <span className="block truncate text-xs text-slate-500">{d.email}</span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-indigo-900/70">Password for all: {DEMO_PASSWORD}</p>
      </div>
    </div>
  );
}

export function Register() {
  const { user, register } = useAuth();
  const after = useAfterAuth();
  const [form, setForm] = useState({ name: '', email: '', password: '', consent: false, talentPoolConsent: false });
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  if (user && !busy) return <Navigate to={homeFor(user)} replace />;
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      after(await register(form));
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight text-slate-900">Create your candidate account</h1>
      <p className="mb-6 text-sm text-slate-500">Apply to jobs and follow every step of your application.</p>
      <Card>
        <form onSubmit={submit} className="space-y-4">
          <ErrorBox error={error} />
          <Input label="Full name" required value={form.name} onChange={set('name')} error={fieldError(error, 'name')} />
          <Input label="Email" type="email" required value={form.email} onChange={set('email')} error={fieldError(error, 'email')} />
          <Input label="Password" type="password" required minLength={8} hint="At least 8 characters" value={form.password} onChange={set('password')} error={fieldError(error, 'password')} />
          <Checkbox
            required
            checked={form.consent}
            onChange={set('consent')}
            label={<>I agree to the processing of my personal data under the privacy policy (required).</>}
          />
          {fieldError(error, 'consent') && <p className="text-xs text-red-600">{fieldError(error, 'consent')}</p>}
          <Checkbox checked={form.talentPoolConsent} onChange={set('talentPoolConsent')} label="Keep my profile in the talent pool for future openings (optional)." />
          <Button type="submit" className="w-full" loading={busy}>
            Create account
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-500">
          Already registered?{' '}
          <Link to="/login" className="font-medium text-indigo-600 hover:underline">
            Log in
          </Link>
        </p>
      </Card>
    </div>
  );
}
