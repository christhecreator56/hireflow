import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { api, ApiError, statusOf } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useApi } from '../../lib/useApi';
import { fmtDate, label } from '../../lib/format';
import type { BoardCard, Job, Stage } from '../../types';
import { Badge, Button, cx, ErrorBox, Loading, MatchRing, Modal, PageHeader, skillMatch, StatusBadge, Textarea } from '../../components/ui';
import { useToast } from '../../components/toast';

const columnStyle = (s: Stage) =>
  s.category === 'HIRED' ? 'bg-emerald-50/60 ring-emerald-100' : s.category === 'REJECTED' ? 'bg-indigo-50/50 ring-indigo-100' : 'bg-white/35 ring-white/50';

export function Pipeline() {
  const { id } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const job = useApi<Job>(`/jobs/${id}`);
  const board = useApi<BoardCard[]>(`/jobs/${id}/applications`);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<BoardCard | null>(null);

  if (job.loading || board.loading) return <Loading />;
  if (job.error || !job.data) return <ErrorBox error={job.error} />;
  const stages = job.data.stages ?? [];
  const cards = board.data ?? [];

  const patchCard = (cardId: string, patch: Partial<BoardCard>) => board.setData(cards.map((c) => (c.id === cardId ? { ...c, ...patch } : c)));

  const move = async (card: BoardCard, stage: Stage) => {
    if (card.currentStageId === stage.id) return;
    if (card.status !== 'ACTIVE') return toast(`This application is ${card.status.toLowerCase()} and cannot be moved`, 'error');
    setMoving(card.id);
    try {
      const res = await api<{ moved: boolean; approvalId?: string; application?: { status: string; currentStageId: string } }>(`/applications/${card.id}/move`, {
        body: { toStageId: stage.id },
      });
      if (statusOf(res) === 202 || !res.moved) {
        patchCard(card.id, { approvals: [...card.approvals.filter((a) => a.id !== res.approvalId), { id: res.approvalId!, targetStageId: stage.id! }] });
        toast(`Sent for approval: moving to ${stage.name} needs ${label(stage.approverRole)} sign-off`, 'info');
      } else {
        patchCard(card.id, { currentStageId: stage.id!, status: res.application!.status });
        toast(`Moved ${card.candidate.user.name} to ${stage.name}`);
      }
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Move failed', 'error');
      if (e instanceof ApiError && e.status === 409) board.reload();
    } finally {
      setMoving(null);
    }
  };

  const onDrop = (stage: Stage) => {
    const card = cards.find((c) => c.id === dragId);
    setDragId(null);
    setOverStage(null);
    if (card) move(card, stage);
  };

  return (
    <div className="min-w-0">
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {job.data.title} <StatusBadge status={job.data.status} />
          </span>
        }
        subtitle={`${cards.length} candidate${cards.length === 1 ? '' : 's'} · drag cards between stages`}
        actions={
          <>
            <Link to="/jobs-admin" className="rounded-full px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">← Jobs</Link>
            {(user?.role === 'EMPLOYER' || user?.role === 'RECRUITER') && (
              <Link to={`/jobs-admin/${id}/workflow`} className="rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm ring-1 ring-slate-300 hover:bg-slate-50">
                Edit workflow
              </Link>
            )}
          </>
        }
      />
      <ErrorBox error={board.error} />
      <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex gap-3">
          {stages.map((s) => {
            const inStage = cards.filter((c) => c.currentStageId === s.id);
            return (
              <section
                key={s.id}
                aria-label={`${s.name} column`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOverStage(s.id!);
                }}
                onDragLeave={() => setOverStage((o) => (o === s.id ? null : o))}
                onDrop={() => onDrop(s)}
                className={cx('flex w-72 shrink-0 flex-col rounded-[28px] p-3 ring-1 backdrop-blur transition', columnStyle(s), overStage === s.id && 'ring-2 ring-indigo-400')}
              >
                <header className="mb-3 flex items-center justify-between px-2 pt-1">
                  <h2 className={cx('text-sm font-medium', s.category === 'HIRED' ? 'text-emerald-800' : s.category === 'REJECTED' ? 'text-indigo-800' : 'text-slate-900')}>
                    {s.name}
                  </h2>
                  <div className="flex items-center gap-1">
                    {s.requiresApproval && <Badge tone="amber">Approval</Badge>}
                    <span className="grid size-6 place-items-center rounded-full bg-white text-xs text-slate-700 tabular-nums">{inStage.length}</span>
                  </div>
                </header>
                <div className="flex min-h-24 flex-col gap-2">
                  {inStage.map((c) => (
                    <KanbanCard
                      key={c.id}
                      card={c}
                      jobSkills={job.data?.skills ?? []}
                      stages={stages}
                      busy={moving === c.id}
                      dragging={dragId === c.id}
                      onDragStart={() => setDragId(c.id)}
                      onDragEnd={() => {
                        setDragId(null);
                        setOverStage(null);
                      }}
                      onMove={(st) => move(c, st)}
                      onReject={() => setRejecting(c)}
                    />
                  ))}
                  {inStage.length === 0 && <p className="rounded-3xl border border-dashed border-black/10 px-2 py-6 text-center text-xs text-slate-400">Drop here</p>}
                </div>
              </section>
            );
          })}
        </div>
      </div>
      {rejecting && (
        <RejectModal
          card={rejecting}
          onClose={() => setRejecting(null)}
          onDone={() => {
            setRejecting(null);
            toast('Candidate rejected');
            board.reload();
          }}
        />
      )}
    </div>
  );
}

function KanbanCard({
  card,
  jobSkills,
  stages,
  busy,
  dragging,
  onDragStart,
  onDragEnd,
  onMove,
  onReject,
}: {
  card: BoardCard;
  jobSkills: string[];
  stages: Stage[];
  busy: boolean;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onMove: (s: Stage) => void;
  onReject: () => void;
}) {
  const active = card.status === 'ACTIVE';
  const pending = card.approvals.length > 0;
  const name = card.candidate.anonymizedAt ? 'Anonymised candidate' : card.candidate.user.name;
  const match = skillMatch(card.candidate.skills, jobSkills);
  return (
    <article
      draggable={active && !busy}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', card.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={cx(
        'rounded-3xl bg-white/90 p-4 shadow-[0_10px_24px_-18px_rgb(27_26_24/.5)] transition',
        active ? 'cursor-grab hover:shadow-md active:cursor-grabbing' : 'opacity-75',
        dragging && 'opacity-40',
        busy && 'animate-pulse',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to={`/applications/${card.id}`} className="block truncate text-[15px] text-slate-900 hover:text-indigo-700">{name}</Link>
          <p className="mt-0.5 text-xs text-slate-500">
            {card.candidate.experienceYears != null ? `${card.candidate.experienceYears} yrs · ` : ''}
            {label(card.source)} · {fmtDate(card.appliedAt)}
          </p>
          {card.status !== 'ACTIVE' && <div className="mt-1"><StatusBadge status={card.status} /></div>}
        </div>
        {match != null && <span title="Skill match with this vacancy"><MatchRing value={match} size={46} highlight={match >= 50} /></span>}
      </div>
      {card.candidate.skills.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {card.candidate.skills.slice(0, 3).map((s) => (
            <span key={s} className={cx('rounded-full px-2 py-0.5 text-[11px]', jobSkills.includes(s) ? 'bg-slate-900 text-white' : 'bg-black/5 text-slate-600')}>{s}</span>
          ))}
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {pending && <Badge tone="amber">Approval pending</Badge>}
        {card._count.interviews > 0 && <Badge tone="blue">{card._count.interviews} interview{card._count.interviews > 1 ? 's' : ''}</Badge>}
      </div>
      {active && (
        <div className="mt-3 flex items-center gap-1.5 border-t border-black/5 pt-3">
          {/* Touch devices have no HTML5 drag-and-drop, so offer a select as well. */}
          <select
            aria-label={`Move ${name}`}
            value=""
            onChange={(e) => {
              const st = stages.find((s) => s.id === e.target.value);
              if (st) onMove(st);
            }}
            className="min-w-0 flex-1 rounded-full border-0 bg-black/5 py-1.5 pl-3 text-xs text-slate-700"
          >
            <option value="">Move to…</option>
            {stages.filter((s) => s.id !== card.currentStageId).map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <Button size="sm" variant="danger" onClick={onReject}>Reject</Button>
        </div>
      )}
    </article>
  );
}

export function RejectModal({ card, onClose, onDone }: { card: { id: string; candidate: { user: { name: string } } }; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`/applications/${card.id}/reject`, { body: { reason } });
      onDone();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={`Reject ${card.candidate.user.name}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="danger" loading={busy} onClick={submit}>Reject candidate</Button>
        </>
      }
    >
      <div className="space-y-3">
        <ErrorBox error={error} />
        <Textarea label="Reason" hint="Kept internal; the candidate sees “Not selected”." value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
      </div>
    </Modal>
  );
}
