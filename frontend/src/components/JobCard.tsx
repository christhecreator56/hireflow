import { Link } from 'react-router';
import { label } from '../lib/format';
import type { PublicJob } from '../types';
import { cx, MatchRing, matchLabel } from './ui';

export const salary = (j: { salaryMin: number | null; salaryMax: number | null }) =>
  j.salaryMin || j.salaryMax ? `₹${(j.salaryMin ?? 0).toLocaleString('en-IN')} – ₹${(j.salaryMax ?? j.salaryMin ?? 0).toLocaleString('en-IN')}` : null;

export const ago = (d: string | null) => {
  if (!d) return 'new';
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);
  return days < 1 ? 'today' : days === 1 ? '1 day ago' : `${days} days ago`;
};

/**
 * Job card. With `match` (signed-in candidate) it shows a skill-match ring;
 * without it, the role's essentials take the ring's place so the card never looks empty.
 */
export function JobCard({ job, match, mySkills = [], highlight }: { job: PublicJob; match?: number | null; mySkills?: string[]; highlight?: boolean }) {
  const pay = salary(job);
  return (
    <Link
      to={`/jobs/${job.id}`}
      className={cx('group flex h-full flex-col p-6 transition hover:-translate-y-0.5', highlight ? 'surface-raised' : 'surface hover:bg-white')}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-lg text-slate-900">{job.title}</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            {[job.org.name, job.department].filter(Boolean).join(' · ')} · {ago(job.publishedAt)}
          </p>
        </div>
        <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-black/5 text-slate-600 transition group-hover:bg-slate-900 group-hover:text-white">
          ↗
        </span>
      </div>

      {match != null ? (
        <div className="mt-5 flex items-center gap-5">
          <MatchRing value={match} size={104} highlight={highlight} caption={matchLabel(match)} />
          <ul className="min-w-0 space-y-1.5 text-xs text-slate-700">
            <li className="truncate">✓ {job.location ?? 'Flexible'}</li>
            <li className="truncate">✓ {label(job.employmentType)}</li>
            <li className="truncate">✓ {pay ?? 'Competitive pay'}</li>
          </ul>
        </div>
      ) : (
        <div className="mt-6">
          <p className="text-2xl font-light tracking-tight text-slate-900">{pay ?? 'Competitive pay'}</p>
          <p className="mt-0.5 text-xs text-slate-500">{job.employmentType === 'INTERNSHIP' ? 'per month' : 'per year'}</p>
          <div className="mt-4 flex flex-wrap gap-1.5 text-xs">
            <span className="rounded-full bg-white px-3 py-1 text-slate-700 ring-1 ring-black/5">{job.location ?? 'Flexible'}</span>
            <span className="rounded-full bg-white px-3 py-1 text-slate-700 ring-1 ring-black/5">{label(job.employmentType)}</span>
          </div>
        </div>
      )}

      <div className="mt-auto flex flex-wrap gap-1 pt-5">
        {job.skills.slice(0, 4).map((s) => {
          const have = mySkills.some((m) => m.toLowerCase() === s.toLowerCase());
          return (
            <span key={s} className={cx('rounded-full px-2.5 py-0.5 text-[11px]', have ? 'bg-slate-900 text-white' : 'bg-black/5 text-slate-600')}>
              {s}
            </span>
          );
        })}
      </div>
    </Link>
  );
}
