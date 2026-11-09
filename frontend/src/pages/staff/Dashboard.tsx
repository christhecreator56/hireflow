import { useRef, useState, type ReactNode } from 'react';
import { useAuth } from '../../lib/auth';
import { useApi } from '../../lib/useApi';
import { label } from '../../lib/format';
import type { Job } from '../../types';
import { cx, ErrorBox, Loading, MatchRing } from '../../components/ui';

type Overview = { total: number; active: number; hired: number; rejected: number; last7Days: number; upcomingInterviews: number };
type Funnel = { stage: string; count: number; percent: number }[];
type TimeToStage = { stage: string; avgDays: number; candidates: number }[];
type Sources = { source: string; count: number; hired: number }[];
type Vacancies = { status: string; count: number }[];

const SOURCE_MARK: Record<string, string> = { LINKEDIN: 'in', REFERRAL: 'Rf', JOB_BOARD: 'Jb', WEBSITE: 'W', OTHER: '•' };

/**
 * Three nested half-discs sharing a left edge (applied → interviewed → hired).
 * Radius follows sqrt(value) so area, not width, encodes the count.
 */
function ArcChart({ tiers, caption }: { tiers: { label: string; value: number }[]; caption: string }) {
  const W = 520, base = 236, x0 = 40, maxR = 215;
  const max = Math.max(1, ...tiers.map((t) => t.value));
  const radius = (v: number) => Math.max(maxR * 0.28, maxR * Math.sqrt(v / max));
  const half = (r: number) => `M ${x0} ${base} A ${r} ${r} 0 0 1 ${x0 + 2 * r} ${base} Z`;
  const [outer, mid, inner] = tiers.map((t) => ({ ...t, r: radius(t.value) }));
  const ticks = Array.from({ length: 21 }, (_, i) => x0 + (i * (2 * maxR)) / 20);
  return (
    <figure className="w-full">
      <svg viewBox={`0 0 ${W} 280`} className="w-full" role="img" aria-label={tiers.map((t) => `${t.label}: ${t.value}`).join(', ')}>
        <defs>
          <linearGradient id="arc-hot" x1="0" y1="0" x2="1" y2="0.3">
            <stop offset="0%" stopColor="#f6d9cf" />
            <stop offset="70%" stopColor="#ef7a5c" />
            <stop offset="100%" stopColor="#e4472a" />
          </linearGradient>
          <pattern id="arc-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="7" stroke="var(--hatch)" strokeWidth="2" />
          </pattern>
        </defs>
        <path d={half(outer.r)} fill="url(#arc-hot)" className="arc-grow" />
        <path d={half(mid.r)} fill="var(--arc-mid)" className="arc-grow" style={{ animationDelay: '.15s' }} />
        <g className="arc-grow" style={{ animationDelay: '.3s' }}>
          <path d={half(inner.r)} fill="var(--arc-inner)" />
          <path d={half(inner.r)} fill="url(#arc-hatch)" />
        </g>
        <line x1={x0 - 10} x2={x0 + 2 * maxR + 10} y1={base} y2={base} stroke="var(--arc-axis)" />
        {ticks.map((x) => (
          <circle key={x} cx={x} cy={base} r={2} fill="var(--arc-axis)" />
        ))}
        {[outer, mid, inner].map((t) => (
          <g key={t.label}>
            <circle cx={x0 + t.r} cy={base - t.r} r={3.5} fill="#e4472a" stroke="var(--color-white)" strokeWidth={1.5} className="fade-in" style={{ animationDelay: '.8s' }} />
            <text x={x0 + t.r} y={base - t.r - 12} textAnchor="middle" className="fill-slate-900 text-[18px] font-light">
              {t.value}
            </text>
          </g>
        ))}
        <text x={x0} y={base + 26} className="fill-slate-500 text-[12px]">{outer.label}</text>
        <text x={x0 + 2 * maxR} y={base + 26} textAnchor="end" className="fill-slate-500 text-[12px]">{inner.label}</text>
        <text x={x0 + maxR} y={base + 26} textAnchor="middle" className="fill-slate-900 text-[12.5px]">{caption}</text>
      </svg>
      <figcaption className="mt-2 flex flex-wrap justify-center gap-4 text-xs text-slate-500">
        {[
          ['bg-indigo-600', outer.label],
          ['bg-[var(--arc-mid)] ring-1 ring-black/10', mid.label],
          ['hatch bg-[var(--arc-inner)]', inner.label],
        ].map(([c, l]) => (
          <span key={l} className="flex items-center gap-1.5">
            <span className={cx('size-2.5 rounded-full', c)} />
            {l}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

function Accordion({ title, open, onToggle, children }: { title: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <div className="surface rounded-3xl">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center justify-between px-5 py-4 text-sm text-slate-900">
        {title}
        <span className={cx('text-[10px] transition', open && 'rotate-180')}>▼</span>
      </button>
      {open && <div className="fade-in px-5 pb-4 text-xs text-slate-600">{children}</div>}
    </div>
  );
}

const Row = ({ k, v }: { k: string; v: ReactNode }) => (
  <div className="flex items-center justify-between py-1">
    <span>{k}</span>
    <span className="font-medium text-slate-900 tabular-nums">{v}</span>
  </div>
);

export function Dashboard() {
  const { user } = useAuth();
  const [jobId, setJobId] = useState('');
  const [openPanel, setOpenPanel] = useState('talent');
  const rail = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(1);
  const qs = jobId ? `?jobId=${jobId}` : '';
  const jobs = useApi<Job[]>('/jobs');
  const overview = useApi<Overview>(`/reports/overview${qs}`);
  const funnel = useApi<Funnel>(`/reports/funnel${qs}`);
  const tts = useApi<TimeToStage>(`/reports/time-to-stage${qs}`);
  const sources = useApi<Sources>(`/reports/sources${qs}`);
  const vacancies = useApi<Vacancies>('/reports/vacancies');

  const o = overview.data;
  const f = funnel.data ?? [];
  const interviewed = f.filter((s) => /interview/i.test(s.stage)).reduce((n, s) => n + s.count, 0);
  const job = jobs.data?.find((j) => j.id === jobId);
  const stageCards = f.slice(1).map((s) => ({ ...s, avgDays: tts.data?.find((t) => t.stage === s.stage)?.avgDays }));
  const published = vacancies.data?.find((v) => v.status === 'PUBLISHED')?.count ?? 0;

  const scroll = (dir: 1 | -1) => {
    rail.current?.scrollBy({ left: dir * 312, behavior: 'smooth' });
    setPage((p) => Math.min(Math.max(1, p + dir), Math.max(1, stageCards.length)));
  };

  return (
    <div>
      <ErrorBox error={overview.error} />
      <section className="grid items-end gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)_260px]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-start gap-3">
            <h1 className="display text-5xl text-slate-900 sm:text-6xl xl:text-7xl">
              Your
              <br />
              hiring pulse
            </h1>
            <span className="mt-2 rounded-full px-4 py-1.5 text-sm text-slate-700 ring-1 ring-slate-400/60">Live data</span>
          </div>
          <p className="mt-6 max-w-sm text-sm leading-relaxed text-slate-500">
            {user?.role === 'HIRING_MANAGER'
              ? 'Everything moving through the vacancies you manage, in one glance.'
              : `${o?.active ?? '…'} active candidates across ${published} open vacancies, with ${o?.upcomingInterviews ?? 0} interviews coming up.`}
          </p>
          <div className="mt-6 flex items-center">
            {(sources.data ?? []).slice(0, 4).map((s, i) => (
              <span
                key={s.source}
                title={`${label(s.source)}: ${s.count}`}
                className={cx('grid size-12 place-items-center rounded-full bg-white text-sm font-semibold text-slate-800 shadow-[0_6px_16px_-10px_rgb(27_26_24/.5)] ring-2 ring-[var(--bg-top)]', i > 0 && '-ml-2')}
              >
                {SOURCE_MARK[s.source] ?? s.source[0]}
              </span>
            ))}
            <span title="Total applications" className="-ml-2 grid size-12 place-items-center rounded-full bg-white/50 text-xs text-slate-600 ring-2 ring-[var(--bg-top)]">
              {o?.total ?? 0}
            </span>
          </div>
        </div>

        <div className="min-w-0">
          {funnel.loading ? (
            <Loading />
          ) : (
            <ArcChart
              caption={job ? job.title : 'Pipeline conversion, all vacancies'}
              tiers={[
                { label: 'Applied', value: f[0]?.count ?? o?.total ?? 0 },
                { label: 'Interviewed', value: interviewed },
                { label: 'Hired', value: o?.hired ?? 0 },
              ]}
            />
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-3 lg:col-span-2 xl:col-span-1">
          <Accordion title="Talent overview" open={openPanel === 'talent'} onToggle={() => setOpenPanel(openPanel === 'talent' ? '' : 'talent')}>
            <Row k="Open vacancies" v={published} />
            <Row k="Applications" v={o?.total ?? '…'} />
            <Row k="New this week" v={o?.last7Days ?? '…'} />
            <Row k="Hired" v={o?.hired ?? '…'} />
            <Row k="Rejected" v={o?.rejected ?? '…'} />
          </Accordion>
          <Accordion title="Sources" open={openPanel === 'sources'} onToggle={() => setOpenPanel(openPanel === 'sources' ? '' : 'sources')}>
            {(sources.data ?? []).map((s) => (
              <div key={s.source} className="py-1">
                <Row k={label(s.source)} v={`${s.count} · ${s.hired} hired`} />
                <div className="h-1 rounded-full bg-black/5">
                  <div className="h-1 rounded-full bg-indigo-500" style={{ width: `${(100 * s.count) / Math.max(1, o?.total ?? 1)}%` }} />
                </div>
              </div>
            ))}
          </Accordion>
          <Accordion title="Vacancy status" open={openPanel === 'vac'} onToggle={() => setOpenPanel(openPanel === 'vac' ? '' : 'vac')}>
            {(vacancies.data ?? []).map((v) => (
              <Row key={v.status} k={label(v.status)} v={v.count} />
            ))}
          </Accordion>
        </div>
      </section>

      <div className="mt-14 mb-4 flex flex-wrap items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white/60 text-slate-800" aria-hidden>
          <svg viewBox="0 0 24 24" className="size-4 fill-current">
            <path d="M3 5h18l-7 8v6l-4-2v-4z" />
          </svg>
        </span>
        <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto pb-1 [scrollbar-width:none]">
          {[{ id: '', title: 'All vacancies' }, ...(jobs.data ?? [])].map((j) => (
            <button
              key={j.id}
              type="button"
              aria-pressed={jobId === j.id}
              onClick={() => {
                setJobId(j.id);
                setPage(1);
                rail.current?.scrollTo({ left: 0 });
              }}
              className={cx('shrink-0 rounded-full px-4 py-2 text-sm whitespace-nowrap transition', jobId === j.id ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-white/60')}
            >
              {j.title}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 text-sm text-slate-900">
          <button type="button" aria-label="Previous stage" onClick={() => scroll(-1)} className="grid size-8 place-items-center rounded-full hover:bg-white/60">←</button>
          <span className="tabular-nums">
            <span className="text-lg">{String(page).padStart(2, '0')}</span>
            <span className="text-xs text-slate-500"> / {String(stageCards.length).padStart(2, '0')}</span>
          </span>
          <button type="button" aria-label="Next stage" onClick={() => scroll(1)} className="grid size-8 place-items-center rounded-full hover:bg-white/60">→</button>
        </div>
      </div>

      <div ref={rail} className="stagger -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-4 [scrollbar-width:none] sm:-mx-6 sm:px-6 lg:-mx-24 lg:px-24">
        {stageCards.length === 0 && !funnel.loading && <p className="text-sm text-slate-500">No pipeline activity yet.</p>}
        {stageCards.map((s, i) => (
          <article key={s.stage} className={cx('w-[300px] shrink-0 snap-start p-6', i === 0 ? 'surface-raised' : 'surface')}>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg text-slate-900">{s.stage}</h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Stage {i + 2} · {s.avgDays != null ? `${s.avgDays} days avg` : 'no timing yet'}
                </p>
              </div>
              <span aria-hidden className="text-slate-500">↗</span>
            </div>
            <div className="mt-5 flex items-center gap-5">
              <MatchRing value={s.percent} size={112} highlight={i === 0} caption={s.percent >= 50 ? 'Strong reach' : 'Conversion'} />
              <ul className="space-y-1.5 text-xs text-slate-700">
                <li>✓ {s.count} reached</li>
                <li>✓ {s.avgDays ?? '–'} days in</li>
                <li>✓ {Math.max(0, (f[0]?.count ?? 0) - s.count)} not yet</li>
              </ul>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
