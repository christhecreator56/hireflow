import { useState } from 'react';
import { Link } from 'react-router';
import { api } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import { fmtDateTime, label } from '../../lib/format';
import { Badge, Button, Card, cx, Empty, ErrorBox, Loading, Modal, PageHeader, Select, StatusBadge, Textarea } from '../../components/ui';
import { useToast } from '../../components/toast';

type MyInterview = {
  id: string;
  title: string;
  scheduledAt: string;
  durationMin: number;
  mode: string;
  locationOrLink: string | null;
  status: string;
  scorecards: { id: string; ratings: Record<string, number>; comments: string | null; recommendation: string }[];
  application: {
    id: string;
    job: { id: string; title: string; criteria: { id: string; name: string }[] };
    candidate: { name: string; email: string; phone: string | null; skills: string[]; experienceYears: number | null };
  };
};

const RECS = ['STRONG_YES', 'YES', 'NO', 'STRONG_NO'];

export function Interviews() {
  const { data, error, loading, reload } = useApi<MyInterview[]>('/interviews/mine');
  const [scoring, setScoring] = useState<MyInterview | null>(null);
  const toast = useToast();
  const now = Date.now();

  return (
    <div>
      <PageHeader title="My interviews" subtitle="Interviews you sit on. Candidate contact details are masked for interviewers." />
      <ErrorBox error={error} />
      {loading ? (
        <Loading />
      ) : !data?.length ? (
        <Empty>You have no interviews assigned.</Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {data.map((iv) => {
            const mine = iv.scorecards[0];
            const past = new Date(iv.scheduledAt).getTime() < now;
            return (
              <Card
                key={iv.id}
                title={
                  <span className="flex flex-wrap items-center gap-2">
                    {iv.application.candidate.name}
                    <span className="font-normal text-slate-400">· {iv.application.job.title}</span>
                  </span>
                }
                actions={<StatusBadge status={iv.status} />}
              >
                <p className="text-sm font-medium text-slate-800">{iv.title}</p>
                <p className={cx('text-sm', past ? 'text-slate-500' : 'text-indigo-700')}>
                  {fmtDateTime(iv.scheduledAt)} · {iv.durationMin} min · {label(iv.mode)}
                </p>
                {iv.locationOrLink && <p className="truncate text-sm text-slate-600">{iv.locationOrLink}</p>}
                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div><dt className="text-slate-500">Email</dt><dd className="font-mono text-slate-700">{iv.application.candidate.email}</dd></div>
                  <div><dt className="text-slate-500">Phone</dt><dd className="font-mono text-slate-700">{iv.application.candidate.phone ?? '—'}</dd></div>
                  <div><dt className="text-slate-500">Experience</dt><dd className="text-slate-700">{iv.application.candidate.experienceYears ?? '—'} yrs</dd></div>
                </dl>
                <div className="mt-2 flex flex-wrap gap-1">
                  {iv.application.candidate.skills.slice(0, 6).map((s) => <Badge key={s}>{s}</Badge>)}
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                  {mine && <Badge tone="green">Scorecard submitted · {label(mine.recommendation)}</Badge>}
                  {iv.status === 'SCHEDULED' && (
                    <Button size="sm" variant={mine ? 'secondary' : 'primary'} onClick={() => setScoring(iv)}>
                      {mine ? 'Edit scorecard' : 'Submit scorecard'}
                    </Button>
                  )}
                  <Link to={`/applications/${iv.application.id}`} className="ml-auto text-xs font-medium text-indigo-600 hover:underline">Open application</Link>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      {scoring && (
        <ScorecardModal
          iv={scoring}
          onClose={() => setScoring(null)}
          onDone={() => {
            setScoring(null);
            toast('Scorecard submitted');
            reload();
          }}
        />
      )}
    </div>
  );
}

function ScorecardModal({ iv, onClose, onDone }: { iv: MyInterview; onClose: () => void; onDone: () => void }) {
  const prev = iv.scorecards[0];
  const criteria = iv.application.job.criteria.map((c) => c.name);
  const [ratings, setRatings] = useState<Record<string, number>>(prev?.ratings ?? {});
  const [comments, setComments] = useState(prev?.comments ?? '');
  const [recommendation, setRecommendation] = useState(prev?.recommendation ?? '');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`/interviews/${iv.id}/scorecards`, { body: { ratings, comments: comments || undefined, recommendation } });
      onDone();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Scorecard · ${iv.application.candidate.name}`} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={submit}>Submit</Button></>}>
      <div className="space-y-4">
        <ErrorBox error={error} />
        {criteria.map((c) => (
          <fieldset key={c}>
            <legend className="mb-1.5 text-sm font-medium text-slate-700">{c}</legend>
            <div className="flex gap-1.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-label={`${c}: ${n}`}
                  aria-pressed={ratings[c] === n}
                  onClick={() => setRatings({ ...ratings, [c]: n })}
                  className={cx(
                    'size-10 rounded-lg text-sm font-semibold ring-1 transition',
                    ratings[c] === n ? 'bg-indigo-600 text-white ring-indigo-600' : 'bg-white text-slate-600 ring-slate-300 hover:ring-indigo-400',
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </fieldset>
        ))}
        <Select label="Recommendation" value={recommendation} onChange={(e) => setRecommendation(e.target.value)}>
          <option value="">Choose…</option>
          {RECS.map((r) => <option key={r} value={r}>{label(r)}</option>)}
        </Select>
        <Textarea label="Comments" rows={3} value={comments} onChange={(e) => setComments(e.target.value)} />
      </div>
    </Modal>
  );
}
