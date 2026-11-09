import { Link } from 'react-router';
import { useApi } from '../lib/useApi';
import type { PublicJob } from '../types';
import { Scene } from '../components/AuthShell';
import { JobCard } from '../components/JobCard';
import { MatchRing } from '../components/ui';

const CANDIDATE = [
  ['Apply in minutes', 'One profile and one resume, reused for every role.'],
  ['See your match', 'Each role shows how much of what it asks for is already on your resume.'],
  ['Know where you stand', 'Every stage change shows up on your timeline, with an email when it matters.'],
  ['Own your data', 'Download everything we hold, or ask for it to be deleted.'],
];
const TEAMS = [
  ['A pipeline per role', 'Each vacancy has its own stages and approval gates, configured without code.'],
  ['Structured interviews', 'Shared scorecards, panel scheduling and no double-booking.'],
  ['Decisions on record', 'Every move, approval and email is in the audit trail.'],
  ['Privacy built in', 'Consent tracking, masked contact details for interviewers, and automatic retention.'],
];
const STEPS = [
  ['01', 'Upload your resume', 'PDF or DOCX. We read your skills and contact details for you.'],
  ['02', 'Find your match', 'Roles are ranked by how well they fit what you already know.'],
  ['03', 'Apply and interview', 'Answer a few questions, then meet the team on a scheduled call.'],
  ['04', 'Get the offer', 'Follow every step on your timeline until the offer lands.'],
];

const Check = () => (
  <span aria-hidden className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-indigo-600 text-[10px] text-white">✓</span>
);

/** Front door for first-time visitors: what HireFlow is, who it is for, and live roles. */
export function Landing() {
  const { data: jobs } = useApi<PublicJob[]>('/public/jobs');
  const list = jobs ?? [];
  const teams = new Set(list.map((j) => j.department).filter(Boolean)).size;
  const places = [...new Set(list.map((j) => j.location).filter(Boolean))];

  return (
    <div className="space-y-24 sm:space-y-32">
      {/* Hero */}
      <section className="grid items-center gap-10 lg:grid-cols-[1.1fr_1fr]">
        <div className="stagger">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/60 px-4 py-1.5 text-xs text-slate-700 ring-1 ring-black/5">
            <span className="size-1.5 rounded-full bg-indigo-600" />
            {list.length ? `${list.length} roles open now` : 'Applicant tracking, done properly'}
          </span>
          <h1 className="display mt-6 text-5xl text-slate-900 sm:text-7xl xl:text-8xl">
            Hiring,
            <br />
            matched.
          </h1>
          <p className="mt-6 max-w-md text-base leading-relaxed text-slate-600">
            HireFlow connects people with the roles that fit them, and gives hiring teams a clear, fair process from first application to signed offer.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/jobs" className="rounded-full bg-slate-900 px-7 py-3.5 text-sm text-white shadow-[0_12px_30px_-14px_rgb(27_26_24/.8)] hover:bg-slate-700">
              Find a job
            </Link>
            <Link to="/login" className="rounded-full bg-white px-7 py-3.5 text-sm text-slate-900 shadow-[0_8px_20px_-12px_rgb(27_26_24/.4)] hover:bg-slate-50">
              I'm hiring →
            </Link>
          </div>
        </div>

        {/* Product preview over the brand scene (illustrative, not live data) */}
        <div className="relative h-[420px] overflow-hidden rounded-[36px] shadow-[0_40px_80px_-40px_rgb(27_26_24/.6)] sm:h-[500px]">
          <Scene plain />
          <div className="float absolute top-6 right-6 left-6 flex items-center gap-4 rounded-3xl bg-white/85 p-4 backdrop-blur sm:left-auto sm:w-72">
            <MatchRing value={92} size={64} highlight />
            <div className="min-w-0">
              <p className="text-sm text-slate-900">Frontend Developer Intern</p>
              <p className="text-xs text-slate-500">Strong match · React, TypeScript</p>
            </div>
          </div>
          <div className="absolute bottom-6 left-6 w-64 ink float rounded-3xl bg-[#1f1d1b]/90 p-4 text-white backdrop-blur">
            <p className="text-[11px] text-white/50">Your application</p>
            <ol className="mt-3 space-y-2 text-xs">
              {['Applied', 'Online test', 'Interview'].map((s, i) => (
                <li key={s} className="flex items-center gap-2">
                  <span className={i < 2 ? 'size-2 rounded-full bg-white/40' : 'size-2 rounded-full bg-indigo-500 ring-4 ring-indigo-500/25'} />
                  <span className={i < 2 ? 'text-white/60' : ''}>{s}</span>
                  {i === 2 && <span className="ml-auto text-white/50">Thu, 11:00</span>}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* Facts from live data */}
      {list.length > 0 && (
        <section className="reveal surface grid grid-cols-3 divide-x divide-black/5 py-6 text-center">
          {[
            [String(list.length).padStart(2, '0'), 'open roles'],
            [String(teams).padStart(2, '0'), teams === 1 ? 'team hiring' : 'teams hiring'],
            [places.length > 2 ? `${places.length} cities` : places.join(' & '), 'locations'],
          ].map(([v, k]) => (
            <div key={k} className="px-2">
              <p className="text-2xl font-light tracking-tight text-slate-900 sm:text-4xl">{v}</p>
              <p className="mt-1 text-xs text-slate-500">{k}</p>
            </div>
          ))}
        </section>
      )}

      {/* Who it is for */}
      <section className="reveal">
        <h2 className="display max-w-xl text-3xl text-slate-900 sm:text-5xl">One flow, two sides</h2>
        <div className="mt-10 grid gap-4 lg:grid-cols-2">
          <article className="surface-raised p-8">
            <p className="text-xs tracking-wide text-indigo-700">FOR CANDIDATES</p>
            <h3 className="mt-2 text-2xl font-light text-slate-900">Find the role that fits you</h3>
            <ul className="mt-6 space-y-4">
              {CANDIDATE.map(([t, d]) => (
                <li key={t} className="flex gap-3">
                  <Check />
                  <div>
                    <p className="text-sm text-slate-900">{t}</p>
                    <p className="text-sm text-slate-500">{d}</p>
                  </div>
                </li>
              ))}
            </ul>
            <Link to="/register" className="mt-8 inline-block rounded-full bg-slate-900 px-6 py-3 text-sm text-white hover:bg-slate-700">
              Create a free profile
            </Link>
          </article>
          <article className="ink rounded-[28px] bg-[#1f1d1b] p-8 text-white">
            <p className="text-xs tracking-wide text-indigo-300">FOR HIRING TEAMS</p>
            <h3 className="mt-2 text-2xl font-light">Run a process you can defend</h3>
            <ul className="mt-6 space-y-4">
              {TEAMS.map(([t, d]) => (
                <li key={t} className="flex gap-3">
                  <Check />
                  <div>
                    <p className="text-sm">{t}</p>
                    <p className="text-sm text-white/55">{d}</p>
                  </div>
                </li>
              ))}
            </ul>
            <Link to="/login" className="mt-8 inline-block rounded-full bg-white px-6 py-3 text-sm text-slate-900 hover:bg-slate-100">
              Open the hiring workspace
            </Link>
          </article>
        </div>
      </section>

      {/* How it works */}
      <section className="reveal">
        <h2 className="display text-3xl text-slate-900 sm:text-5xl">How it works</h2>
        <ol className="stagger mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(([n, t, d]) => (
            <li key={n} className="surface p-6">
              <p className="text-4xl font-light tracking-tight text-indigo-600">{n}</p>
              <p className="mt-6 text-base text-slate-900">{t}</p>
              <p className="mt-1 text-sm text-slate-500">{d}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Live roles */}
      {list.length > 0 && (
        <section className="reveal">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 className="display text-3xl text-slate-900 sm:text-5xl">Open right now</h2>
            <Link to="/jobs" className="rounded-full px-5 py-2 text-sm text-slate-900 ring-1 ring-slate-900/20 hover:bg-white/60">
              All {list.length} roles →
            </Link>
          </div>
          <ul className="stagger mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {list.slice(0, 3).map((j, i) => (
              <li key={j.id}>
                <JobCard job={j} highlight={i === 0} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Closing call to action */}
      <section className="reveal ink relative overflow-hidden rounded-[36px] bg-[#1f1d1b] px-8 py-14 text-white sm:px-14">
        <div className="relative z-10 max-w-lg">
          <h2 className="display text-4xl sm:text-6xl">Your next role starts here</h2>
          <p className="mt-4 text-sm text-white/60">Upload your resume once. We'll show you where you fit, and keep you posted at every step.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/register" className="rounded-full bg-gradient-to-r from-[#f8a488] to-[#e4472a] px-7 py-3.5 text-sm">
              Get started
            </Link>
            <Link to="/jobs" className="rounded-full px-7 py-3.5 text-sm ring-1 ring-white/30 hover:bg-white/10">
              Browse roles
            </Link>
          </div>
        </div>
        <div className="absolute inset-y-0 right-0 hidden w-1/2 opacity-90 [mask-image:linear-gradient(to_right,transparent,black_40%)] md:block">
          <Scene plain />
        </div>
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-black/10 pt-6 pb-2 text-xs text-slate-500">
        <span>© {new Date().getFullYear()} HireFlow · Acme Technologies</span>
        <nav className="flex gap-5">
          <Link to="/jobs" className="hover:text-slate-900">Jobs</Link>
          <Link to="/register" className="hover:text-slate-900">Sign up</Link>
          <Link to="/login" className="hover:text-slate-900">Log in</Link>
        </nav>
      </footer>
    </div>
  );
}
