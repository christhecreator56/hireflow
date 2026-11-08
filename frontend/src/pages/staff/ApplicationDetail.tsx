import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { api, statusOf } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useApi } from '../../lib/useApi';
import { fmtDate, fmtDateTime, label } from '../../lib/format';
import type { EmailTemplate, Stage, StaffUser } from '../../types';
import { Badge, Button, Card, Checkbox, Empty, ErrorBox, Input, Loading, Modal, PageHeader, Select, StatusBadge, Table, Textarea } from '../../components/ui';
import { useToast } from '../../components/toast';
import { openResume } from '../portal/Profile';
import { RejectModal } from './Pipeline';

type Scorecard = { id: string; ratings: Record<string, number>; comments: string | null; recommendation: string; submittedAt: string; interviewer: { id: string; name: string } };
type Interview = {
  id: string;
  title: string;
  scheduledAt: string;
  durationMin: number;
  mode: string;
  locationOrLink: string | null;
  status: string;
  panel: { user: { id: string; name: string; role: string } }[];
  scorecards: Scorecard[];
};
type AppDetail = {
  id: string;
  status: string;
  source: string;
  appliedAt: string;
  rejectionReason: string | null;
  job: { id: string; title: string; stages: Stage[]; criteria: { id: string; name: string }[] };
  currentStage: Stage;
  resume: { id: string; fileName: string } | null;
  candidate: {
    phone: string | null;
    location: string | null;
    linkedin: string | null;
    headline: string | null;
    skills: string[];
    experienceYears: number | null;
    anonymizedAt: string | null;
    user: { id: string; name: string; email: string };
  };
  answers: { id: string; value: unknown; question: { label: string; type: string; order: number } }[];
  transitions: { id: string; createdAt: string; note: string | null; fromStage: { name: string } | null; toStage: { name: string }; movedBy: { name: string; role: string } | null }[];
  approvals: { id: string; status: string; comment: string | null; createdAt: string; decidedAt: string | null; targetStage: { name: string; approverRole: string | null } }[];
  interviews: Interview[];
  notes: { id: string; body: string; createdAt: string; author: string }[];
  emails: { id: string; toEmail: string; templateKey: string | null; subject: string; status: string; error: string | null; createdAt: string }[];
};

const fmtAnswer = (v: unknown) => (Array.isArray(v) ? v.join(', ') : typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v ?? '—'));
const REC_TONE: Record<string, 'green' | 'red' | 'amber'> = { STRONG_YES: 'green', YES: 'green', NO: 'red', STRONG_NO: 'red' };

export function averages(scorecards: Scorecard[], criteria: string[]) {
  return criteria.map((c) => {
    const vals = scorecards.map((s) => s.ratings[c]).filter((v): v is number => typeof v === 'number');
    return { criterion: c, avg: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null };
  });
}

export function ApplicationDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const { data: app, error, loading, reload } = useApi<AppDetail>(`/applications/${id}`);
  const [moveError, setMoveError] = useState<unknown>(null);
  const [moving, setMoving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [scheduling, setScheduling] = useState(false);

  if (loading && !app) return <Loading />;
  if (error || !app) return <ErrorBox error={error} />;
  const c = app.candidate;
  const canEmail = user?.role === 'EMPLOYER' || user?.role === 'RECRUITER';
  const active = app.status === 'ACTIVE';

  const move = async (toStageId: string) => {
    if (!toStageId) return;
    setMoving(true);
    setMoveError(null);
    try {
      const res = await api<{ moved: boolean }>(`/applications/${app.id}/move`, { body: { toStageId } });
      toast(statusOf(res) === 202 || !res.moved ? 'Sent for approval' : 'Stage updated', statusOf(res) === 202 ? 'info' : 'success');
      reload();
    } catch (e) {
      setMoveError(e);
    } finally {
      setMoving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {c.anonymizedAt ? 'Anonymised candidate' : c.user.name}
            <StatusBadge status={app.status} />
          </span>
        }
        subtitle={
          <>
            <Link to={`/jobs-admin/${app.job.id}/pipeline`} className="text-indigo-600 hover:underline">{app.job.title}</Link> · currently in <strong>{app.currentStage.name}</strong> · applied {fmtDate(app.appliedAt)} via {label(app.source)}
          </>
        }
        actions={
          active && (
            <>
              <div className="w-48">
                <Select aria-label="Move to stage" value="" disabled={moving} onChange={(e) => move(e.target.value)}>
                  <option value="">Move to stage…</option>
                  {app.job.stages.filter((s) => s.id !== app.currentStage.id).map((s) => (
                    <option key={s.id} value={s.id}>{s.name}{s.requiresApproval ? ' (needs approval)' : ''}</option>
                  ))}
                </Select>
              </div>
              <Button variant="secondary" onClick={() => setScheduling(true)}>Schedule interview</Button>
              <Button variant="danger" onClick={() => setRejecting(true)}>Reject</Button>
            </>
          )
        }
      />
      <div className="mb-4">
        <ErrorBox error={moveError} />
      </div>
      {app.rejectionReason && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">Rejection reason: {app.rejectionReason}</p>}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <InterviewsCard app={app} />
          <Card title="Answers">
            {app.answers.length === 0 ? (
              <p className="text-sm text-slate-500">No application questions answered.</p>
            ) : (
              <dl className="space-y-3">
                {[...app.answers].sort((a, b) => a.question.order - b.question.order).map((a) => (
                  <div key={a.id}>
                    <dt className="text-xs font-medium text-slate-500">{a.question.label}</dt>
                    <dd className="text-sm whitespace-pre-line text-slate-800">{fmtAnswer(a.value)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </Card>
          <NotesCard app={app} onAdded={reload} />
          <EmailCard app={app} canSend={canEmail} onSent={reload} />
        </div>
        <div className="min-w-0 space-y-6">
          <Card title="Profile">
            <dl className="space-y-2 text-sm">
              {[
                ['Email', c.user.email],
                ['Phone', c.phone],
                ['Location', c.location],
                ['Experience', c.experienceYears != null ? `${c.experienceYears} years` : null],
                ['Headline', c.headline],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <dt className="text-slate-500">{k}</dt>
                  <dd className="min-w-0 truncate text-right text-slate-800">{v || '—'}</dd>
                </div>
              ))}
              {c.linkedin && (
                <a href={c.linkedin} target="_blank" rel="noreferrer" className="block truncate text-indigo-600 hover:underline">LinkedIn profile</a>
              )}
            </dl>
            {c.skills.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1">
                {c.skills.map((s) => <Badge key={s}>{s}</Badge>)}
              </div>
            )}
            <div className="mt-4">
              {app.resume ? (
                <Button variant="secondary" className="w-full" onClick={() => openResume(`/applications/resumes/${app.resume!.id}/url`)}>
                  View resume · {app.resume.fileName}
                </Button>
              ) : (
                <p className="text-sm text-slate-500">No resume attached.</p>
              )}
            </div>
          </Card>
          <Card title="Stage history">
            <ol className="relative space-y-4 border-l border-slate-200 pl-4">
              {app.transitions.map((t, i) => (
                <li key={t.id} className="relative">
                  <span className={`absolute top-1.5 -left-[21px] size-2.5 rounded-full ring-4 ring-white ${i === app.transitions.length - 1 ? 'bg-indigo-600' : 'bg-slate-300'}`} />
                  <p className="text-sm font-medium text-slate-800">{t.fromStage ? `${t.fromStage.name} → ${t.toStage.name}` : t.toStage.name}</p>
                  <p className="text-xs text-slate-500">{fmtDateTime(t.createdAt)}{t.movedBy ? ` · ${t.movedBy.name}` : ''}</p>
                  {t.note && <p className="mt-0.5 text-xs text-slate-600 italic">“{t.note}”</p>}
                </li>
              ))}
            </ol>
          </Card>
          <Card title="Approvals">
            {app.approvals.length === 0 ? (
              <p className="text-sm text-slate-500">No approval requests.</p>
            ) : (
              <ul className="space-y-2">
                {app.approvals.map((a) => (
                  <li key={a.id} className="rounded-lg bg-slate-50 p-2.5 text-sm ring-1 ring-slate-200">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">To {a.targetStage.name}</span>
                      <StatusBadge status={a.status} />
                    </div>
                    <p className="text-xs text-slate-500">Approver: {label(a.targetStage.approverRole)} · {fmtDateTime(a.createdAt)}</p>
                    {a.comment && <p className="mt-1 text-xs text-slate-600">“{a.comment}”</p>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
      {rejecting && (
        <RejectModal
          card={{ id: app.id, candidate: { user: { name: c.user.name } } }}
          onClose={() => setRejecting(false)}
          onDone={() => {
            setRejecting(false);
            toast('Candidate rejected');
            reload();
          }}
        />
      )}
      {scheduling && (
        <ScheduleModal
          appId={app.id}
          onClose={() => setScheduling(false)}
          onDone={() => {
            setScheduling(false);
            toast('Interview scheduled, candidate notified');
            reload();
          }}
        />
      )}
    </div>
  );
}

function InterviewsCard({ app }: { app: AppDetail }) {
  const criteria = app.job.criteria.map((c) => c.name);
  return (
    <Card title="Interviews">
      {app.interviews.length === 0 ? (
        <Empty>No interviews yet.</Empty>
      ) : (
        <div className="space-y-4">
          {app.interviews.map((iv) => (
            <div key={iv.id} className="rounded-lg ring-1 ring-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
                <div>
                  <p className="font-medium text-slate-900">{iv.title}</p>
                  <p className="text-xs text-slate-500">
                    {fmtDateTime(iv.scheduledAt)} · {iv.durationMin} min · {label(iv.mode)}
                    {iv.locationOrLink ? ` · ${iv.locationOrLink}` : ''}
                  </p>
                </div>
                <StatusBadge status={iv.status} />
              </div>
              <div className="px-4 py-3">
                <p className="mb-2 text-xs text-slate-500">Panel: {iv.panel.map((p) => p.user.name).join(', ')}</p>
                {iv.scorecards.length === 0 ? (
                  <p className="text-sm text-slate-500">No scorecards submitted yet.</p>
                ) : (
                  <>
                    <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {averages(iv.scorecards, criteria).map((a) => (
                        <div key={a.criterion} className="rounded-lg bg-indigo-50/60 px-3 py-2">
                          <p className="truncate text-xs text-slate-600">{a.criterion}</p>
                          <p className="text-lg font-semibold text-indigo-700 tabular-nums">{a.avg?.toFixed(1) ?? '—'}<span className="text-xs font-normal text-slate-400">/5</span></p>
                        </div>
                      ))}
                    </div>
                    <ul className="space-y-2">
                      {iv.scorecards.map((s) => (
                        <li key={s.id} className="text-sm">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-slate-800">{s.interviewer.name}</span>
                            <Badge tone={REC_TONE[s.recommendation] ?? 'gray'}>{label(s.recommendation)}</Badge>
                            <span className="text-xs text-slate-400">{Object.entries(s.ratings).map(([k, v]) => `${k}: ${v}`).join(' · ')}</span>
                          </div>
                          {s.comments && <p className="mt-0.5 text-slate-600">{s.comments}</p>}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function NotesCard({ app, onAdded }: { app: AppDetail; onAdded: () => void }) {
  const [body, setBody] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/applications/${app.id}/notes`, { body: { body } });
      setBody('');
      onAdded();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title="Notes">
      <form onSubmit={add} className="mb-4 space-y-2">
        <Textarea aria-label="New note" rows={2} placeholder="Add an internal note…" value={body} onChange={(e) => setBody(e.target.value)} />
        <ErrorBox error={error} />
        <Button type="submit" size="sm" loading={busy} disabled={!body.trim()}>Add note</Button>
      </form>
      {app.notes.length === 0 ? (
        <p className="text-sm text-slate-500">No notes yet.</p>
      ) : (
        <ul className="space-y-3">
          {app.notes.map((n) => (
            <li key={n.id} className="rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
              <p className="text-sm whitespace-pre-line text-slate-800">{n.body}</p>
              <p className="mt-1 text-xs text-slate-500">{n.author} · {fmtDateTime(n.createdAt)}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function EmailCard({ app, canSend, onSent }: { app: AppDetail; canSend: boolean; onSent: () => void }) {
  const templates = useApi<EmailTemplate[]>(canSend ? '/admin/email-templates' : null);
  const toast = useToast();
  const [key, setKey] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`/applications/${app.id}/email`, { body: { templateKey: key } });
      toast('Email sent');
      setKey('');
      onSent();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title="Emails">
      {canSend && (
        <div className="mb-4 flex flex-wrap items-end gap-2">
          <div className="min-w-48 flex-1">
            <Select label="Send email" value={key} onChange={(e) => setKey(e.target.value)}>
              <option value="">Choose template…</option>
              {templates.data?.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
            </Select>
          </div>
          <Button disabled={!key} loading={busy} onClick={send}>Send</Button>
          <div className="w-full">
            <ErrorBox error={error} />
          </div>
        </div>
      )}
      <Table head={['Sent', 'Subject', 'Template', 'Status']} empty={app.emails.length === 0}>
        {app.emails.map((m) => (
          <tr key={m.id}>
            <td className="whitespace-nowrap text-slate-500">{fmtDateTime(m.createdAt)}</td>
            <td className="min-w-48">{m.subject}</td>
            <td className="text-slate-500">{m.templateKey ?? '—'}</td>
            <td title={m.error ?? undefined}><StatusBadge status={m.status} /></td>
          </tr>
        ))}
      </Table>
    </Card>
  );
}

function ScheduleModal({ appId, onClose, onDone }: { appId: string; onClose: () => void; onDone: () => void }) {
  const users = useApi<StaffUser[]>('/users');
  const [f, setF] = useState({ title: 'Interview', scheduledAt: '', durationMin: '60', mode: 'ONLINE', locationOrLink: '' });
  const [panel, setPanel] = useState<string[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`/applications/${appId}/interviews`, {
        body: {
          title: f.title,
          // datetime-local is local time without zone; toISOString converts it to UTC for the API.
          scheduledAt: f.scheduledAt ? new Date(f.scheduledAt).toISOString() : '',
          durationMin: Number(f.durationMin),
          mode: f.mode,
          locationOrLink: f.locationOrLink || undefined,
          interviewerIds: panel,
        },
      });
      onDone();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const fe = (k: string) => {
    const d = (error as { details?: Record<string, string[]> })?.details?.[k];
    return d?.join(', ');
  };

  return (
    <Modal open onClose={onClose} title="Schedule interview" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={submit}>Schedule</Button></>}>
      <div className="space-y-4">
        {error != null && (error as { status?: number }).status === 409 ? (
          <div role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-300">
            <p className="font-semibold">Scheduling conflict</p>
            <p>{(error as Error).message}</p>
          </div>
        ) : (
          <ErrorBox error={error} />
        )}
        <Input label="Title" value={f.title} onChange={set('title')} error={fe('title')} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Date & time" type="datetime-local" value={f.scheduledAt} onChange={set('scheduledAt')} error={fe('scheduledAt')} />
          <Input label="Duration (minutes)" type="number" min={15} max={480} step={15} value={f.durationMin} onChange={set('durationMin')} error={fe('durationMin')} />
          <Select label="Mode" value={f.mode} onChange={set('mode')}>
            <option value="ONLINE">Online</option>
            <option value="ONSITE">On-site</option>
          </Select>
          <Input label={f.mode === 'ONLINE' ? 'Meeting link' : 'Location'} value={f.locationOrLink} onChange={set('locationOrLink')} error={fe('locationOrLink')} />
        </div>
        <fieldset>
          <legend className="mb-1 text-sm font-medium text-slate-700">Interviewers</legend>
          {users.loading ? (
            <Loading />
          ) : (
            <div className="grid max-h-48 gap-1.5 overflow-y-auto rounded-lg p-2 ring-1 ring-slate-200 sm:grid-cols-2">
              {users.data?.filter((u) => u.isActive).map((u) => (
                <Checkbox
                  key={u.id}
                  label={<>{u.name} <span className="text-xs text-slate-400">{label(u.role)}</span></>}
                  checked={panel.includes(u.id)}
                  onChange={(e) => setPanel(e.target.checked ? [...panel, u.id] : panel.filter((x) => x !== u.id))}
                />
              ))}
            </div>
          )}
          {fe('interviewerIds') && <p className="mt-1 text-xs text-red-600">{fe('interviewerIds')}</p>}
        </fieldset>
      </div>
    </Modal>
  );
}
