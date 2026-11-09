import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useApi } from '../lib/useApi';
import { useAuth } from '../lib/auth';
import { EMPLOYMENT_TYPES, label } from '../lib/format';
import type { PublicJob } from '../types';
import { cx, Empty, ErrorBox, Loading, skillMatch } from '../components/ui';
import { JobCard } from '../components/JobCard';

export { salary } from '../components/JobCard';

export function JobBoard() {
  const { user } = useAuth();
  const isCandidate = user?.role === 'CANDIDATE';
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const { data: jobs, error, loading } = useApi<PublicJob[]>(`/public/jobs?${params.toString()}`);
  const all = useApi<PublicJob[]>('/public/jobs'); // unfiltered, for the location list
  const profile = useApi<{ skills: string[] }>(isCandidate ? '/me/profile' : null);
  const mySkills = profile.data?.skills ?? [];

  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    v ? next.set(k, v) : next.delete(k);
    setParams(next);
  };
  const filtered = ['q', 'location', 'type'].some((k) => params.get(k));
  const locations = [...new Set((all.data ?? []).map((j) => j.location).filter((l): l is string => !!l))].sort();
  const scored = (jobs ?? [])
    .map((j) => ({ ...j, match: isCandidate ? skillMatch(mySkills, j.skills) : null }))
    .sort((a, b) => (b.match ?? -1) - (a.match ?? -1));

  return (
    <div>
      <section className="grid items-end gap-6 lg:grid-cols-[1fr_auto]">
        <div>
          <p className="text-xs tracking-wide text-indigo-700">{isCandidate ? 'RANKED FOR YOU' : 'OPEN ROLES'}</p>
          <h1 className="display mt-3 text-5xl text-slate-900 sm:text-6xl">{isCandidate ? 'Your job match' : 'Find your next role'}</h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-slate-500">
            {isCandidate
              ? mySkills.length
                ? 'Every open role compared with the skills on your profile. Best fits first.'
                : 'Add skills to your profile (or upload a resume) and we will rank every role by fit.'
              : 'Every open position at Acme. Filter by type or place, or search by title and skill.'}
          </p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            set('q', q.trim());
          }}
          className="flex w-full items-center gap-1 rounded-full bg-white/70 p-1 ring-1 ring-black/5 backdrop-blur lg:w-[420px]"
        >
          <input
            aria-label="Search jobs"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search title or skill"
            className="min-w-0 flex-1 bg-transparent px-4 py-2.5 text-sm outline-none placeholder:text-slate-400"
          />
          <button type="submit" className="rounded-full bg-slate-900 px-5 py-2.5 text-sm text-white">Search</button>
        </form>
      </section>

      {!user && (
        <div className="mt-8 flex flex-wrap items-center justify-between gap-4 ink fade-in rounded-3xl bg-[#1f1d1b] px-6 py-4 text-white">
          <p className="text-sm">
            <span className="text-indigo-300">Tip:</span> sign up and upload your resume to see how well you match each role.
          </p>
          <div className="flex gap-2">
            <Link to="/register" className="rounded-full bg-white px-5 py-2 text-sm text-slate-900">Sign up free</Link>
            <Link to="/login" className="rounded-full px-5 py-2 text-sm ring-1 ring-white/30 hover:bg-white/10">Log in</Link>
          </div>
        </div>
      )}

      <div className="mt-8 mb-5 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-full bg-white/50 p-1">
          {['', ...EMPLOYMENT_TYPES].map((t) => {
            const on = (params.get('type') ?? '') === t;
            return (
              <button
                key={t || 'all'}
                type="button"
                aria-pressed={on}
                onClick={() => set('type', t)}
                className={cx('rounded-full px-4 py-1.5 text-sm transition', on ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-white')}
              >
                {t ? label(t) : 'All'}
              </button>
            );
          })}
        </div>
        <select
          aria-label="Location"
          value={params.get('location') ?? ''}
          onChange={(e) => set('location', e.target.value)}
          className="rounded-full bg-white/50 px-4 py-2 text-sm text-slate-700 outline-none hover:bg-white"
        >
          <option value="">Any location</option>
          {locations.map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
        {filtered && (
          <button
            type="button"
            onClick={() => {
              setQ('');
              setParams(new URLSearchParams());
            }}
            className="px-2 text-xs text-slate-500 underline-offset-2 hover:underline"
          >
            Clear filters
          </button>
        )}
        <span className="ml-auto text-sm text-slate-900 tabular-nums">
          {String(scored.length).padStart(2, '0')} <span className="text-xs text-slate-500">{scored.length === 1 ? 'role' : 'roles'}</span>
        </span>
      </div>

      <ErrorBox error={error} />
      {loading ? (
        <Loading />
      ) : !scored.length ? (
        <Empty>No open roles match these filters.</Empty>
      ) : (
        <ul className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {scored.map((j, i) => (
            <li key={j.id}>
              <JobCard job={j} match={j.match} mySkills={mySkills} highlight={i === 0} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
