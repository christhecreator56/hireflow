import { useState } from 'react';
import { Link } from 'react-router';
import { api } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import { fmtDate, fmtDateTime, label } from '../../lib/format';
import { Badge, Button, Card, Empty, ErrorBox, Loading, StatusBadge } from '../../components/ui';
import { useToast } from '../../components/toast';

type MyApp = {
  id: string;
  status: string;
  statusLabel: string;
  appliedAt: string;
  job: { id: string; title: string; location: string | null; org: { name: string } };
  timeline: { at: string; label: string }[];
  interviews: { id: string; title: string; scheduledAt: string; durationMin: number; mode: string; locationOrLink: string | null; status: string }[];
};

export function MyApplications() {
  const { data, error, loading, reload } = useApi<MyApp[]>('/me/applications');
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<unknown>(null);

  const withdraw = async (a: MyApp) => {
    if (!confirm(`Withdraw your application for ${a.job.title}?`)) return;
    setBusy(a.id);
    setActionError(null);
    try {
      await api(`/me/applications/${a.id}/withdraw`, { method: 'POST' });
      toast('Application withdrawn');
      reload();
    } catch (e) {
      setActionError(e);
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  if (!data?.length)
    return (
      <Empty>
        You haven't applied anywhere yet.{' '}
        <Link to="/jobs" className="font-medium text-indigo-600 hover:underline">Browse open jobs</Link>
      </Empty>
    );

  return (
    <div className="space-y-4">
      <ErrorBox error={actionError} />
      {data.map((a) => {
        const upcoming = a.interviews.filter((i) => i.status === 'SCHEDULED' && new Date(i.scheduledAt) > new Date());
        return (
          <Card
            key={a.id}
            title={
              <span className="flex flex-wrap items-center gap-2">
                <Link to={`/jobs/${a.job.id}`} className="hover:text-indigo-700">{a.job.title}</Link>
                <span className="font-normal text-slate-400">· {a.job.org.name}</span>
              </span>
            }
            actions={
              <>
                <Badge tone={a.status === 'ACTIVE' ? 'indigo' : a.status === 'HIRED' ? 'green' : a.status === 'REJECTED' ? 'red' : 'gray'}>{a.statusLabel}</Badge>
                {a.status === 'ACTIVE' && (
                  <Button size="sm" variant="danger" loading={busy === a.id} onClick={() => withdraw(a)}>Withdraw</Button>
                )}
              </>
            }
          >
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <h3 className="mb-3 text-xs font-semibold tracking-wide text-slate-500 uppercase">Timeline</h3>
                <ol className="relative space-y-3 border-l border-slate-200 pl-4">
                  {a.timeline.map((t, i) => (
                    <li key={i} className="relative">
                      <span className={`absolute top-1.5 -left-[21px] size-2.5 rounded-full ring-4 ring-white ${i === a.timeline.length - 1 ? 'bg-indigo-600' : 'bg-slate-300'}`} />
                      <p className="text-sm font-medium text-slate-800">{t.label}</p>
                      <p className="text-xs text-slate-500">{fmtDate(t.at)}</p>
                    </li>
                  ))}
                  {a.status === 'WITHDRAWN' && (
                    <li className="relative">
                      <span className="absolute top-1.5 -left-[21px] size-2.5 rounded-full bg-slate-400 ring-4 ring-white" />
                      <p className="text-sm font-medium text-slate-800">Withdrawn</p>
                    </li>
                  )}
                </ol>
              </div>
              <div>
                <h3 className="mb-3 text-xs font-semibold tracking-wide text-slate-500 uppercase">Upcoming interviews</h3>
                {upcoming.length === 0 ? (
                  <p className="text-sm text-slate-500">None scheduled.</p>
                ) : (
                  <ul className="space-y-2">
                    {upcoming.map((i) => (
                      <li key={i.id} className="rounded-lg bg-slate-50 p-3 text-sm ring-1 ring-slate-200">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-slate-900">{i.title}</span>
                          <StatusBadge status={i.status} />
                        </div>
                        <p className="mt-1 text-slate-600">{fmtDateTime(i.scheduledAt)} · {i.durationMin} min · {label(i.mode)}</p>
                        {i.locationOrLink && (
                          /^https?:\/\//.test(i.locationOrLink) ? (
                            <a href={i.locationOrLink} target="_blank" rel="noreferrer" className="mt-1 block truncate text-indigo-600 hover:underline">{i.locationOrLink}</a>
                          ) : (
                            <p className="mt-1 text-slate-600">{i.locationOrLink}</p>
                          )
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-4 text-xs text-slate-400">Applied {fmtDate(a.appliedAt)}</p>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
