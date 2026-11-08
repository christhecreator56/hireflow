import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useApi } from '../lib/useApi';
import { useAuth } from '../lib/auth';
import { EMPLOYMENT_TYPES, label } from '../lib/format';
import type { PublicJob } from '../types';
import { cx, Empty, ErrorBox, Loading, MatchRing, matchLabel, skillMatch } from '../components/ui';

export const salary = (j: { salaryMin: number | null; salaryMax: number | null }) =>
  j.salaryMin || j.salaryMax ? `₹${(j.salaryMin ?? 0).toLocaleString()} – ₹${(j.salaryMax ?? j.salaryMin ?? 0).toLocaleString()}` : null;

const ago = (d: string | null) => {
  if (!d) return 'new';
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);
  return days < 1 ? 'today' : days === 1 ? '1 day ago' : `${days} days ago`;
};

export function JobBoard() {
  const { user } = useAuth();
  const isCandidate = user?.role === 'CANDIDATE';
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const { data: jobs, error, loading } = useApi<PublicJob[]>(`/public/jobs?${params.toString()}`);
  const profile = useApi<{ skills: string[] }>(isCandidate ? '/me/profile' : null);
  const mySkills = profile.data?.skills ?? [];

  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    v ? next.set(k, v) : next.delete(k);
    setParams(next);
  };
  const active = ['q', 'location', 'type'].filter((k) => params.get(k));
  const scored = (jobs ?? [])
    .map((j) => ({ ...j, match: isCandidate ? skillMatch(mySkills, j.skills) : null }))
    .sort((a, b) => (b.match ?? -1) - (a.match ?? -1));

  return (
    <div>
      <section className="grid items-end gap-8 lg:grid-cols-[1fr_auto]">
        <div>
          <div className="flex flex-wrap items-start gap-3">
            <h1 className="display text-5xl text-slate-900 sm:text-7xl">
              Your
              <br />
              job match
            </h1>
            <span className="mt-2 rounded-full px-4 py-1.5 text-sm text-slate-700 ring-1 ring-slate-400/60">Skills-matched</span>
          </div>
          <p className="mt-6 max-w-md text-sm leading-relaxed text-slate-500">
            {isCandidate
              ? mySkills.length
                ? 'We compared every open role with the skills on your profile. The best matches come first.'
                : 'Add skills to your profile and we will rank every open role by how well it fits you.'
              : 'Browse open roles. Sign in as a candidate to see how well each one matches your skills.'}
          </p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            set('q', q.trim());
          }}
          className="flex w-full items-center gap-1 rounded-full bg-white/60 p-1 backdrop-blur lg:w-[420px]"
        >
          <input
            aria-label="Search jobs"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search title or keyword"
            className="min-w-0 flex-1 bg-transparent px-4 py-2 text-sm outline-none placeholder:text-slate-400"
          />
          <button type="submit" className="rounded-full bg-slate-900 px-5 py-2 text-sm text-white">Search</button>
        </form>
      </section>

      <div className="mt-12 mb-4 flex flex-wrap items-center gap-2">
        <span className="grid size-10 place-items-center rounded-full bg-white/60 text-slate-800" aria-hidden>
          <svg viewBox="0 0 24 24" className="size-4 fill-current">
            <path d="M3 5h18l-7 8v6l-4-2v-4z" />
          </svg>
        </span>
        {EMPLOYMENT_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={params.get('type') === t}
            onClick={() => set('type', params.get('type') === t ? '' : t)}
            className={cx('rounded-full px-4 py-2 text-sm transition', params.get('type') === t ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-white/60')}
          >
            {label(t)}
          </button>
        ))}
        <select
          aria-label="Location"
          value={params.get('location') ?? ''}
          onChange={(e) => set('location', e.target.value)}
          className="rounded-full bg-transparent px-3 py-2 text-sm text-slate-700 outline-none hover:bg-white/60"
        >
          <option value="">Any location</option>
          {['Chennai', 'Bengaluru', 'Hyderabad', 'Remote'].map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
        {active.length > 0 && (
          <button type="button" onClick={() => { setQ(''); setParams(new URLSearchParams()); }} className="text-xs text-slate-500 underline-offset-2 hover:underline">
            Clear filters
          </button>
        )}
        <span className="ml-auto text-sm text-slate-900 tabular-nums">
          {String(scored.length).padStart(2, '0')} <span className="text-xs text-slate-500">open roles</span>
        </span>
      </div>

      <ErrorBox error={error} />
      {loading ? (
        <Loading />
      ) : !scored.length ? (
        <Empty>No open jobs match your filters.</Empty>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {scored.map((j, i) => (
            <li key={j.id}>
              <Link
                to={`/jobs/${j.id}`}
                className={cx('group block h-full p-6 transition hover:-translate-y-0.5', i === 0 ? 'surface-raised' : 'surface hover:bg-white')}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="truncate text-lg text-slate-900">{j.title}</h2>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {[j.org.name, j.department].filter(Boolean).join(' · ')} · {ago(j.publishedAt)}
                    </p>
                  </div>
                  <span aria-hidden className="text-slate-500 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-indigo-600">↗</span>
                </div>
                <div className="mt-5 flex items-center gap-5">
                  {j.match != null ? (
                    <MatchRing value={j.match} size={104} highlight={i === 0} caption={matchLabel(j.match)} />
                  ) : (
                    <div className="grid size-[104px] shrink-0 place-items-center rounded-full border border-dashed border-slate-400/70 p-3 text-center text-[10px] leading-tight text-slate-500">
                      {isCandidate ? 'Add skills to see match' : 'Sign in to see match'}
                    </div>
                  )}
                  <ul className="min-w-0 space-y-1.5 text-xs text-slate-700">
                    <li className="truncate">✓ {j.location ?? 'Flexible'}</li>
                    <li className="truncate">✓ {label(j.employmentType)}</li>
                    <li className="truncate">✓ {salary(j) ?? 'Competitive pay'}</li>
                  </ul>
                </div>
                <div className="mt-4 flex flex-wrap gap-1">
                  {j.skills.slice(0, 4).map((s) => {
                    const have = mySkills.some((m) => m.toLowerCase() === s.toLowerCase());
                    return (
                      <span key={s} className={cx('rounded-full px-2.5 py-0.5 text-[11px]', have ? 'bg-slate-900 text-white' : 'bg-black/5 text-slate-600')}>
                        {s}
                      </span>
                    );
                  })}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
