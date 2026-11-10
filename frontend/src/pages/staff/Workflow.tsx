import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { api } from '../../lib/api';
import type { Role } from '../../lib/auth';
import { useApi } from '../../lib/useApi';
import { label } from '../../lib/format';
import type { EmailTemplate, Job, Stage, StageCategory } from '../../types';
import { Badge, Button, Card, Checkbox, ChipsInput, cx, ErrorBox, Input, Loading, Modal, PageHeader, Select } from '../../components/ui';
import { useToast } from '../../components/toast';
import { swap } from './JobsAdmin';

const CATEGORIES: StageCategory[] = ['ACTIVE', 'HIRED', 'REJECTED'];
const APPROVERS: Role[] = ['EMPLOYER', 'RECRUITER', 'HIRING_MANAGER'];
const toPayload = (stages: Stage[]) =>
  stages.map(({ id, name, category, notifyCandidate, emailTemplateKey, requiresApproval, approverRole }) => ({
    ...(id && { id }),
    name,
    category,
    notifyCandidate,
    emailTemplateKey: emailTemplateKey || null,
    requiresApproval,
    approverRole: requiresApproval ? approverRole : null,
  }));

export function Workflow() {
  const { id } = useParams();
  const toast = useToast();
  const job = useApi<Job>(`/jobs/${id}`);
  const templates = useApi<EmailTemplate[]>('/admin/email-templates');
  const [stages, setStages] = useState<Stage[]>([]);
  const [criteria, setCriteria] = useState<string[]>([]);
  const [stageError, setStageError] = useState<unknown>(null);
  const [criteriaError, setCriteriaError] = useState<unknown>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [tplOpen, setTplOpen] = useState(false);
  const [focusAt, setFocusAt] = useState<number | null>(null);

  useEffect(() => {
    if (focusAt === null) return;
    const input = document.querySelector<HTMLInputElement>(`[data-stage-index="${focusAt}"]`);
    input?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    input?.focus({ preventScroll: true });
    input?.select();
    setFocusAt(null);
  }, [focusAt]);

  useEffect(() => {
    if (!job.data) return;
    setStages(job.data.stages ?? []);
    setCriteria(job.data.criteria?.map((c) => c.name) ?? []);
  }, [job.data]);

  if (job.loading) return <Loading />;
  if (job.error || !job.data) return <ErrorBox error={job.error} />;

  const update = (i: number, patch: Partial<Stage>) => setStages(stages.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  // New stages go before the closing Hired/Rejected stages (not below them, off-screen), then get focus.
  const addStage = () => {
    const firstClosing = stages.findIndex((s) => s.category !== 'ACTIVE');
    const at = firstClosing === -1 ? stages.length : firstClosing;
    const taken = new Set(stages.map((s) => s.name.trim().toLowerCase()));
    let n = 1;
    while (taken.has(`new stage ${n}`)) n++;
    const stage: Stage = { name: `New stage ${n}`, category: 'ACTIVE', notifyCandidate: false, emailTemplateKey: null, requiresApproval: false, approverRole: null };
    setStages([...stages.slice(0, at), stage, ...stages.slice(at)]);
    setFocusAt(at);
  };
  const dirty = JSON.stringify(toPayload(stages)) !== JSON.stringify(toPayload(job.data.stages ?? []));

  const saveStages = async () => {
    setBusy('stages');
    setStageError(null);
    try {
      const saved = await api<Stage[]>(`/jobs/${id}/stages`, { method: 'PUT', body: toPayload(stages) });
      toast('Workflow saved');
      job.setData({ ...job.data!, stages: saved.map((s) => ({ ...s, _count: stages.find((x) => x.id === s.id)?._count })) });
    } catch (e) {
      setStageError(e);
    } finally {
      setBusy(null);
    }
  };

  const saveCriteria = async () => {
    setBusy('criteria');
    setCriteriaError(null);
    try {
      await api(`/jobs/${id}/criteria`, { method: 'PUT', body: criteria });
      toast('Scorecard criteria saved');
    } catch (e) {
      setCriteriaError(e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <PageHeader
        title={`Workflow · ${job.data.title}`}
        subtitle="Each vacancy owns its own stages, notifications and approval gates."
        actions={
          <>
            <Link to={`/jobs-admin/${id}/pipeline`} className="rounded-full px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">← Pipeline</Link>
            <Button variant="secondary" onClick={() => setTplOpen(true)}>Save as template</Button>
          </>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <Card
          title="Stages"
          actions={
            <>
              <Button size="sm" variant="secondary" onClick={addStage}>
                + Add stage
              </Button>
              <Button size="sm" loading={busy === 'stages'} disabled={!dirty} onClick={saveStages}>Save workflow</Button>
            </>
          }
        >
          <div className="mb-4">
            <ErrorBox error={stageError} />
          </div>
          <ol className="space-y-3">
            {stages.map((s, i) => {
              const count = s._count?.applications ?? 0;
              return (
                <li
                  key={s.id ?? `new-${i}`}
                  className={cx(
                    'rounded-lg p-3 ring-1',
                    s.category === 'HIRED' ? 'bg-emerald-50/60 ring-emerald-200' : s.category === 'REJECTED' ? 'bg-red-50/60 ring-red-200' : 'bg-slate-50 ring-slate-200',
                  )}
                >
                  <div className="flex flex-wrap items-end gap-3">
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-white text-xs font-semibold text-slate-500 ring-1 ring-slate-200">{i + 1}</span>
                    <div className="min-w-40 flex-1">
                      <Input aria-label="Stage name" data-stage-index={i} value={s.name} onChange={(e) => update(i, { name: e.target.value })} />
                    </div>
                    <div className="w-36">
                      <Select aria-label="Category" value={s.category} onChange={(e) => update(i, { category: e.target.value as StageCategory })}>
                        {CATEGORIES.map((c) => <option key={c} value={c}>{label(c)}</option>)}
                      </Select>
                    </div>
                    <div className="flex items-center gap-1">
                      {count > 0 && <Badge tone="indigo">{count} candidate{count > 1 ? 's' : ''}</Badge>}
                      <Button size="sm" variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => setStages(swap(stages, i, i - 1))}>↑</Button>
                      <Button size="sm" variant="ghost" aria-label="Move down" disabled={i === stages.length - 1} onClick={() => setStages(swap(stages, i, i + 1))}>↓</Button>
                      <Button size="sm" variant="danger" aria-label={`Delete ${s.name}`} onClick={() => setStages(stages.filter((_, j) => j !== i))}>Delete</Button>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Checkbox label="Email the candidate on entering this stage" checked={s.notifyCandidate} onChange={(e) => update(i, { notifyCandidate: e.target.checked })} />
                      {s.notifyCandidate && (
                        <Select aria-label="Email template" value={s.emailTemplateKey ?? ''} onChange={(e) => update(i, { emailTemplateKey: e.target.value || null })}>
                          <option value="">Choose template…</option>
                          {templates.data?.map((t) => <option key={t.key} value={t.key}>{t.name} ({t.key})</option>)}
                        </Select>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Checkbox
                        label="Requires approval to enter"
                        checked={s.requiresApproval}
                        onChange={(e) => update(i, { requiresApproval: e.target.checked, approverRole: e.target.checked ? (s.approverRole ?? 'HIRING_MANAGER') : null })}
                      />
                      {s.requiresApproval && (
                        <Select aria-label="Approver role" value={s.approverRole ?? ''} onChange={(e) => update(i, { approverRole: (e.target.value || null) as Role | null })}>
                          <option value="">Choose approver…</option>
                          {APPROVERS.map((r) => <option key={r} value={r}>Approver: {label(r)}</option>)}
                        </Select>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
          <p className="mt-4 text-xs text-slate-500">
            Rules: at least 2 stages, the first must be Active, one must be Rejected, names must be unique. Stages that still hold candidates can't be deleted.
          </p>
        </Card>

        <Card title="Scorecard criteria" actions={<Button size="sm" loading={busy === 'criteria'} onClick={saveCriteria}>Save</Button>}>
          <p className="mb-3 text-sm text-slate-600">Interviewers rate each criterion from 1 to 5.</p>
          <ChipsInput value={criteria} onChange={setCriteria} placeholder="Add criterion and press Enter" />
          <div className="mt-3">
            <ErrorBox error={criteriaError} />
          </div>
        </Card>
      </div>
      <SaveTemplateModal open={tplOpen} stages={stages} onClose={() => setTplOpen(false)} onSaved={() => { setTplOpen(false); toast('Template saved'); }} />
    </div>
  );
}

function SaveTemplateModal({ open, stages, onClose, onSaved }: { open: boolean; stages: Stage[]; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api('/pipeline-templates', { body: { name, stages: toPayload(stages).map(({ id: _id, ...s }) => s) } });
      setName('');
      onSaved();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Save as pipeline template" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={save}>Save template</Button></>}>
      <div className="space-y-3">
        <ErrorBox error={error} />
        <Input label="Template name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <p className="text-xs text-slate-500">Saves the {stages.length} stages currently shown (including unsaved edits) for reuse on new jobs.</p>
      </div>
    </Modal>
  );
}
