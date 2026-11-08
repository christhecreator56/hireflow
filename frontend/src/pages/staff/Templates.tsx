import { useState } from 'react';
import { api, fieldError } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import { fmtDateTime } from '../../lib/format';
import type { EmailTemplate } from '../../types';
import { Button, Card, cx, Empty, ErrorBox, Input, Loading, PageHeader, StatusBadge, Table, Textarea } from '../../components/ui';
import { useToast } from '../../components/toast';

const VARS = ['candidateName', 'jobTitle', 'stageName', 'companyName', 'interviewDate', 'interviewTitle', 'location', 'durationMin'];
type EmailLog = { id: string; toEmail: string; templateKey: string | null; subject: string; status: string; error: string | null; createdAt: string };
const blank = { key: '', name: '', subject: '', bodyHtml: '' };

export function Templates() {
  const templates = useApi<EmailTemplate[]>('/admin/email-templates');
  const [page, setPage] = useState(1);
  const logs = useApi<EmailLog[]>(`/admin/email-logs?page=${page}&pageSize=15`);
  const toast = useToast();
  const [form, setForm] = useState<typeof blank | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const select = (t: EmailTemplate) => {
    setForm({ key: t.key, name: t.name, subject: t.subject, bodyHtml: t.bodyHtml });
    setIsNew(false);
    setError(null);
  };

  const save = async () => {
    if (!form) return;
    setBusy(true);
    setError(null);
    try {
      const { key, ...body } = form;
      if (!/^[a-z_]{3,40}$/.test(key)) throw new Error('Key must be 3–40 lowercase letters or underscores');
      await api(`/admin/email-templates/${key}`, { method: 'PUT', body });
      toast('Template saved');
      setIsNew(false);
      templates.reload();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const set = (k: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form!, [k]: e.target.value });

  return (
    <div>
      <PageHeader
        title="Email templates"
        subtitle="Handlebars templates used by stage notifications and manual emails."
        actions={
          <a href="http://localhost:8025" target="_blank" rel="noreferrer" className="rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm ring-1 ring-slate-300 hover:bg-slate-50">
            Open Mailpit sandbox ↗
          </a>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <Card
          title="Templates"
          actions={
            <Button size="sm" variant="secondary" onClick={() => { setForm({ ...blank }); setIsNew(true); setError(null); }}>
              + New
            </Button>
          }
        >
          {templates.loading ? (
            <Loading />
          ) : (
            <ul className="-mx-2 space-y-0.5">
              {templates.data?.map((t) => (
                <li key={t.key}>
                  <button
                    type="button"
                    onClick={() => select(t)}
                    className={cx('w-full rounded-lg px-2 py-2 text-left', form?.key === t.key && !isNew ? 'bg-indigo-50' : 'hover:bg-slate-50')}
                  >
                    <span className="block text-sm font-medium text-slate-800">{t.name}</span>
                    <span className="block font-mono text-xs text-slate-500">{t.key}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title={form ? (isNew ? 'New template' : `Edit · ${form.name}`) : 'Editor'} actions={form && <Button size="sm" loading={busy} onClick={save}>Save template</Button>}>
          {!form ? (
            <Empty>Select a template to edit.</Empty>
          ) : (
            <div className="space-y-4">
              <ErrorBox error={error} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="Key" value={form.key} disabled={!isNew} onChange={set('key')} hint="Lowercase letters and underscores" />
                <Input label="Name" value={form.name} onChange={set('name')} error={fieldError(error, 'name')} />
              </div>
              <Input label="Subject" value={form.subject} onChange={set('subject')} error={fieldError(error, 'subject')} />
              <Textarea label="Body (HTML)" rows={10} className="font-mono text-xs" value={form.bodyHtml} onChange={set('bodyHtml')} error={fieldError(error, 'bodyHtml')} />
              <div>
                <p className="mb-1.5 text-xs font-medium text-slate-500">Available variables (click to insert)</p>
                <div className="flex flex-wrap gap-1.5">
                  {VARS.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setForm({ ...form, bodyHtml: `${form.bodyHtml}{{${v}}}` })}
                      className="rounded-md bg-slate-100 px-2 py-1 font-mono text-xs text-slate-700 hover:bg-indigo-50 hover:text-indigo-700"
                    >
                      {`{{${v}}}`}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>

      <Card
        className="mt-6"
        title="Email log"
        actions={
          <>
            <Button size="sm" variant="secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button>
            <span className="text-xs text-slate-500">Page {page}</span>
            <Button size="sm" variant="secondary" disabled={(logs.data?.length ?? 0) < 15} onClick={() => setPage(page + 1)}>Next</Button>
          </>
        }
      >
        <ErrorBox error={logs.error} />
        {logs.loading ? (
          <Loading />
        ) : (
          <Table head={['When', 'To', 'Subject', 'Template', 'Status']} empty={!logs.data?.length}>
            {logs.data?.map((l) => (
              <tr key={l.id}>
                <td className="whitespace-nowrap text-slate-500">{fmtDateTime(l.createdAt)}</td>
                <td className="whitespace-nowrap">{l.toEmail}</td>
                <td className="min-w-56">{l.subject}</td>
                <td className="font-mono text-xs text-slate-500">{l.templateKey ?? '—'}</td>
                <td title={l.error ?? undefined}><StatusBadge status={l.status} /></td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
