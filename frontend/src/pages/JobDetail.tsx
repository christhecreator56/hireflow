import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useApi } from '../lib/useApi';
import { fmtDate, label, SOURCES } from '../lib/format';
import type { PublicJob, Question, Resume } from '../types';
import { Badge, Button, Card, Checkbox, ErrorBox, Input, Loading, Select, Textarea } from '../components/ui';
import { ResumeUpload } from '../components/ResumeUpload';
import { useToast } from '../components/toast';
import { salary } from './JobBoard';

type Answer = string | string[] | boolean;

export function JobDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { data: job, error, loading } = useApi<PublicJob>(`/public/jobs/${id}`);
  const [applying, setApplying] = useState(false);

  if (loading) return <Loading />;
  if (error || !job) return <ErrorBox error={error ?? 'Job not found'} />;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="min-w-0 space-y-6">
        <div>
          <Link to="/jobs" className="text-sm text-indigo-600 hover:underline">← All jobs</Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">{job.title}</h1>
          <p className="mt-1 text-slate-500">{[job.org.name, job.department, job.location].filter(Boolean).join(' · ')}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge tone="indigo">{label(job.employmentType)}</Badge>
            {salary(job) && <Badge>{salary(job)}</Badge>}
            <Badge>Posted {fmtDate(job.publishedAt)}</Badge>
          </div>
        </div>
        <Card title="About the role">
          <p className="text-sm leading-relaxed whitespace-pre-line text-slate-700">{job.description}</p>
          {job.requirements && (
            <>
              <h3 className="mt-5 mb-2 text-sm font-semibold text-slate-900">Requirements</h3>
              <p className="text-sm leading-relaxed whitespace-pre-line text-slate-700">{job.requirements}</p>
            </>
          )}
          {job.skills.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-1.5">
              {job.skills.map((s) => <Badge key={s}>{s}</Badge>)}
            </div>
          )}
        </Card>
      </div>
      <div className="lg:sticky lg:top-20 lg:self-start">
        {!user ? (
          <Card title="Interested?">
            <p className="mb-4 text-sm text-slate-600">Log in or create a free candidate account to apply.</p>
            <Link to={`/login?next=/jobs/${job.id}`} className="block rounded-lg bg-indigo-600 px-4 py-2 text-center text-sm font-medium text-white hover:bg-slate-700">
              Apply now
            </Link>
          </Card>
        ) : user.role !== 'CANDIDATE' ? (
          <Card title="Staff view">
            <p className="text-sm text-slate-600">You are signed in as staff. Only candidates can apply.</p>
          </Card>
        ) : applying ? (
          <ApplyForm job={job} />
        ) : (
          <Card title="Interested?">
            <Button className="w-full" onClick={() => setApplying(true)}>Apply now</Button>
          </Card>
        )}
      </div>
    </div>
  );
}

function ApplyForm({ job }: { job: PublicJob }) {
  const toast = useToast();
  const navigate = useNavigate();
  const { data: resumes, setData: setResumes } = useApi<Resume[]>('/me/resumes');
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [resumeId, setResumeId] = useState('');
  const [source, setSource] = useState('WEBSITE');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const set = (qid: string, v: Answer) => setAnswers((a) => ({ ...a, [qid]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/jobs/${job.id}/apply`, { body: { answers, source, resumeId: resumeId || undefined } });
      toast('Application submitted');
      navigate('/portal');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Your application">
      <form onSubmit={submit} className="space-y-4">
        {job.questions?.map((q) => (
          <QuestionField key={q.id} q={q} value={answers[q.id!]} onChange={(v) => set(q.id!, v)} />
        ))}
        <div className="space-y-2">
          <Select label="Resume" value={resumeId} onChange={(e) => setResumeId(e.target.value)}>
            <option value="">No resume</option>
            {resumes?.map((r) => (
              <option key={r.id} value={r.id}>{r.fileName} ({fmtDate(r.uploadedAt)})</option>
            ))}
          </Select>
          <ResumeUpload
            onUploaded={(r) => {
              setResumes([r, ...(resumes ?? [])]);
              setResumeId(r.id);
            }}
          />
        </div>
        <Select label="How did you hear about us?" value={source} onChange={(e) => setSource(e.target.value)}>
          {SOURCES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
        </Select>
        <ErrorBox error={error} />
        <Button type="submit" className="w-full" loading={busy}>Submit application</Button>
      </form>
    </Card>
  );
}

function QuestionField({ q, value, onChange }: { q: Question; value: Answer | undefined; onChange: (v: Answer) => void }) {
  const text = `${q.label}${q.required ? ' *' : ''}`;
  switch (q.type) {
    case 'LONG_TEXT':
      return <Textarea label={text} required={q.required} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} />;
    case 'SINGLE_CHOICE':
      return (
        <Select label={text} required={q.required} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">Select…</option>
          {q.options.map((o) => <option key={o}>{o}</option>)}
        </Select>
      );
    case 'MULTI_CHOICE': {
      const arr = (value as string[]) ?? [];
      return (
        <fieldset>
          <legend className="mb-1 text-sm font-medium text-slate-700">{text}</legend>
          <div className="space-y-1.5">
            {q.options.map((o) => (
              <Checkbox key={o} label={o} checked={arr.includes(o)} onChange={(e) => onChange(e.target.checked ? [...arr, o] : arr.filter((x) => x !== o))} />
            ))}
          </div>
        </fieldset>
      );
    }
    case 'YES_NO':
      return (
        <fieldset>
          <legend className="mb-1 text-sm font-medium text-slate-700">{text}</legend>
          <div className="flex gap-4 text-sm">
            {[true, false].map((b) => (
              <label key={String(b)} className="flex items-center gap-1.5">
                <input type="radio" name={q.id} required={q.required} checked={value === b} onChange={() => onChange(b)} className="accent-indigo-600" />
                {b ? 'Yes' : 'No'}
              </label>
            ))}
          </div>
        </fieldset>
      );
    default:
      return <Input label={text} required={q.required} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} />;
  }
}
