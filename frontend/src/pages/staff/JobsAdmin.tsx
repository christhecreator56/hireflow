import { useState } from 'react';
import { Link } from 'react-router';
import { api, fieldError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useApi } from '../../lib/useApi';
import { nextStatuses, statusAction, type JobStatus } from '../../lib/jobStatus';
import { EMPLOYMENT_TYPES, fmtDate, label } from '../../lib/format';
import type { Job, Question, QuestionType, StaffUser } from '../../types';
import { Badge, Button, Card, Checkbox, ChipsInput, Empty, ErrorBox, Input, Loading, Modal, PageHeader, Select, StatusBadge, Table, Textarea } from '../../components/ui';
import { useToast } from '../../components/toast';

export function JobsAdmin() {
  const { user } = useAuth();
  const canEdit = user?.role === 'EMPLOYER' || user?.role === 'RECRUITER';
  const { data: jobs, error, loading, reload } = useApi<Job[]>('/jobs');
  const toast = useToast();
  const [editing, setEditing] = useState<Job | 'new' | null>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const setStatus = async (job: Job, status: JobStatus) => {
    if (status === 'CLOSED' && !confirm(`Close "${job.title}"? Closed jobs cannot be reopened.`)) return;
    setBusy(job.id + status);
    setActionError(null);
    try {
      await api(`/jobs/${job.id}/status`, { body: { status } });
      toast(`Job ${status.toLowerCase()}`);
      reload();
    } catch (e) {
      setActionError(e);
    } finally {
      setBusy(null);
    }
  };

  const openEdit = async (job: Job) => {
    try {
      setEditing(await api<Job>(`/jobs/${job.id}`));
    } catch (e) {
      setActionError(e);
    }
  };

  return (
    <div>
      <PageHeader
        title="Jobs"
        subtitle={user?.role === 'HIRING_MANAGER' ? 'Vacancies you are the hiring manager for.' : 'Create vacancies, manage their workflow and follow candidates.'}
        actions={canEdit && <Button onClick={() => setEditing('new')}>+ New job</Button>}
      />
      <ErrorBox error={error ?? actionError} />
      <Card>
        {loading ? (
          <Loading />
        ) : !jobs?.length ? (
          <Empty>No jobs yet{canEdit ? ' — create your first vacancy.' : '.'}</Empty>
        ) : (
          <Table head={['Job', 'Status', 'Applicants', 'Hiring manager', 'Created', '']}>
            {jobs.map((j) => (
              <tr key={j.id} className="align-middle">
                <td className="min-w-48">
                  <Link to={`/jobs-admin/${j.id}/pipeline`} className="font-medium text-slate-900 hover:text-indigo-700">{j.title}</Link>
                  <p className="text-xs text-slate-500">{[j.department, j.location, label(j.employmentType)].filter(Boolean).join(' · ')}</p>
                </td>
                <td><StatusBadge status={j.status} /></td>
                <td className="tabular-nums">{j._count.applications}</td>
                <td className="whitespace-nowrap">{j.hiringManager?.name ?? <span className="text-slate-400">—</span>}</td>
                <td className="whitespace-nowrap text-slate-500">{fmtDate(j.createdAt)}</td>
                <td>
                  <div className="flex flex-wrap justify-end gap-1.5">
                    <Link to={`/jobs-admin/${j.id}/pipeline`} className="rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100">Pipeline</Link>
                    {canEdit && (
                      <>
                        <Link to={`/jobs-admin/${j.id}/workflow`} className="rounded-lg px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50">Workflow</Link>
                        <Button size="sm" variant="secondary" onClick={() => openEdit(j)}>Edit</Button>
                        {nextStatuses(j.status).map((s) => (
                          <Button key={s} size="sm" variant={s === 'CLOSED' ? 'danger' : 'secondary'} loading={busy === j.id + s} onClick={() => setStatus(j, s)}>
                            {statusAction[s]}
                          </Button>
                        ))}
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      {editing && (
        <JobForm
          job={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            toast('Job saved');
            reload();
          }}
        />
      )}
    </div>
  );
}

type Template = { id: string; name: string };
const QTYPES: QuestionType[] = ['TEXT', 'LONG_TEXT', 'SINGLE_CHOICE', 'MULTI_CHOICE', 'YES_NO'];
const strip = (qs: Question[]) => qs.map(({ label, type, options, required }) => ({ label, type, options: type.endsWith('CHOICE') ? options : [], required }));

function JobForm({ job, onClose, onSaved }: { job: Job | null; onClose: () => void; onSaved: () => void }) {
  const users = useApi<StaffUser[]>('/users');
  const templates = useApi<Template[]>(job ? null : '/pipeline-templates');
  const [f, setF] = useState({
    title: job?.title ?? '',
    department: job?.department ?? '',
    location: job?.location ?? '',
    employmentType: job?.employmentType ?? 'FULL_TIME',
    salaryMin: job?.salaryMin?.toString() ?? '',
    salaryMax: job?.salaryMax?.toString() ?? '',
    description: job?.description ?? '',
    requirements: job?.requirements ?? '',
    hiringManagerId: job?.hiringManagerId ?? '',
    skills: job?.skills ?? [],
  });
  const [questions, setQuestions] = useState<Question[]>(job?.questions ? strip(job.questions) : []);
  const [templateId, setTemplateId] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const managers = users.data?.filter((u) => u.role === 'HIRING_MANAGER' && u.isActive) ?? [];

  const save = async () => {
    setBusy(true);
    setError(null);
    const num = (s: string) => (s === '' ? null : Number(s));
    const fields = {
      ...f,
      department: f.department || null,
      location: f.location || null,
      requirements: f.requirements || null,
      hiringManagerId: f.hiringManagerId || null,
      salaryMin: num(f.salaryMin),
      salaryMax: num(f.salaryMax),
    };
    try {
      // API reports this refine only as a generic "Validation failed", so check it here.
      if (fields.salaryMin != null && fields.salaryMax != null && fields.salaryMin > fields.salaryMax) throw new Error('Salary min cannot exceed salary max');
      if (!job) {
        await api('/jobs', { body: { ...fields, questions: strip(questions), pipelineTemplateId: templateId || undefined } });
      } else {
        await api(`/jobs/${job.id}`, { method: 'PATCH', body: fields });
        if (JSON.stringify(strip(questions)) !== JSON.stringify(strip(job.questions ?? []))) {
          await api(`/jobs/${job.id}/questions`, { method: 'PUT', body: strip(questions) });
        }
      }
      onSaved();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const updateQ = (i: number, patch: Partial<Question>) => setQuestions(questions.map((q, j) => (j === i ? { ...q, ...patch } : q)));

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={job ? `Edit ${job.title}` : 'New job'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={busy} onClick={save}>{job ? 'Save changes' : 'Create job (draft)'}</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <ErrorBox error={error} />
        </div>
        <div className="sm:col-span-2">
          <Input label="Title *" value={f.title} onChange={set('title')} error={fieldError(error, 'title')} />
        </div>
        <Input label="Department" value={f.department} onChange={set('department')} error={fieldError(error, 'department')} />
        <Input label="Location" value={f.location} onChange={set('location')} error={fieldError(error, 'location')} />
        <Select label="Employment type" value={f.employmentType} onChange={set('employmentType')}>
          {EMPLOYMENT_TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}
        </Select>
        <Select label="Hiring manager" value={f.hiringManagerId} onChange={set('hiringManagerId')} error={fieldError(error, 'hiringManagerId')}>
          <option value="">None</option>
          {managers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </Select>
        <Input label="Salary min (₹/yr)" type="number" min={0} value={f.salaryMin} onChange={set('salaryMin')} error={fieldError(error, 'salaryMin')} />
        <Input label="Salary max (₹/yr)" type="number" min={0} value={f.salaryMax} onChange={set('salaryMax')} error={fieldError(error, 'salaryMax')} />
        <div className="sm:col-span-2">
          <Textarea label="Description *" rows={5} value={f.description} onChange={set('description')} error={fieldError(error, 'description')} />
        </div>
        <div className="sm:col-span-2">
          <Textarea label="Requirements" rows={3} value={f.requirements} onChange={set('requirements')} />
        </div>
        <div className="sm:col-span-2">
          <ChipsInput label="Skills" value={f.skills} onChange={(skills) => setF({ ...f, skills })} />
        </div>
        {!job && (
          <div className="sm:col-span-2">
            <Select label="Pipeline" value={templateId} onChange={(e) => setTemplateId(e.target.value)} hint="You can fine-tune stages later in the workflow editor.">
              <option value="">Default pipeline (Applied → Screening → Assessment → Interview → Offer → Hired / Rejected)</option>
              {templates.data?.map((t) => <option key={t.id} value={t.id}>Template: {t.name}</option>)}
            </Select>
          </div>
        )}
      </div>

      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Application questions</h3>
          <Button size="sm" variant="secondary" onClick={() => setQuestions([...questions, { label: '', type: 'TEXT', options: [], required: false }])}>+ Add question</Button>
        </div>
        {job && job._count.applications > 0 && <p className="mb-2 text-xs text-amber-700">Questions are locked once candidates have applied.</p>}
        {questions.length === 0 ? (
          <p className="text-sm text-slate-500">No custom questions.</p>
        ) : (
          <ol className="space-y-3">
            {questions.map((q, i) => (
              <li key={i} className="rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
                <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
                  <Input aria-label={`Question ${i + 1}`} placeholder="Question text" value={q.label} onChange={(e) => updateQ(i, { label: e.target.value })} />
                  <Select aria-label="Question type" value={q.type} onChange={(e) => updateQ(i, { type: e.target.value as QuestionType })}>
                    {QTYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}
                  </Select>
                </div>
                {q.type.endsWith('CHOICE') && (
                  <div className="mt-3">
                    <ChipsInput placeholder="Add an option and press Enter" value={q.options} onChange={(options) => updateQ(i, { options })} />
                  </div>
                )}
                <div className="mt-3 flex items-center justify-between">
                  <Checkbox label="Required" checked={q.required} onChange={(e) => updateQ(i, { required: e.target.checked })} />
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" disabled={i === 0} aria-label="Move up" onClick={() => setQuestions(swap(questions, i, i - 1))}>↑</Button>
                    <Button size="sm" variant="ghost" disabled={i === questions.length - 1} aria-label="Move down" onClick={() => setQuestions(swap(questions, i, i + 1))}>↓</Button>
                    <Button size="sm" variant="danger" onClick={() => setQuestions(questions.filter((_, j) => j !== i))}>Remove</Button>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
      {job && <p className="mt-4 text-xs text-slate-500"><Badge>{job.status}</Badge> Use the status buttons on the job list to publish, pause or close.</p>}
    </Modal>
  );
}

export function swap<T>(arr: T[], a: number, b: number) {
  const next = [...arr];
  [next[a], next[b]] = [next[b], next[a]];
  return next;
}
