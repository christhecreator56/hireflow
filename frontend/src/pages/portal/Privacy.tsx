import { useState } from 'react';
import { api } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import { fmtDate, fmtDateTime, label, saveJson } from '../../lib/format';
import { Badge, Button, Card, Empty, ErrorBox, Loading, StatusBadge, Table, Textarea } from '../../components/ui';
import { useToast } from '../../components/toast';

type Consent = { id: string; type: string; policyVersion: string; granted: boolean; createdAt: string; withdrawnAt: string | null };
type DataRequest = { id: string; type: string; status: string; reason: string | null; createdAt: string; completedAt: string | null };

const TOGGLES = [
  { type: 'TALENT_POOL', title: 'Talent pool', text: 'Let recruiters contact you about future openings.' },
  { type: 'MARKETING', title: 'Marketing', text: 'Occasional news about the company and events.' },
];

export function Privacy() {
  const consents = useApi<Consent[]>('/me/consents');
  const requests = useApi<DataRequest[]>('/me/data-requests');
  const toast = useToast();
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const active = (type: string) => consents.data?.some((c) => c.type === type && c.granted && !c.withdrawnAt) ?? false;

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  };

  const toggle = (type: string) =>
    run(type, async () => {
      consents.setData(await api<Consent[]>('/me/consents', { body: { type, granted: !active(type) } }));
    });

  const download = () =>
    run('export', async () => {
      saveJson(await api('/me/export'), 'my-data.json');
    });

  const requestDeletion = () =>
    run('delete', async () => {
      if (!confirm('Request deletion of your personal data? Your applications will be anonymised once approved.')) return;
      await api('/me/data-requests', { body: { reason: reason || undefined } });
      setReason('');
      toast('Deletion request submitted');
      requests.reload();
    });

  return (
    <div className="space-y-6">
      <ErrorBox error={error} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Consent preferences">
          <div className="space-y-4">
            {TOGGLES.map((t) => {
              const on = active(t.type);
              return (
                <div key={t.type} className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{t.title}</p>
                    <p className="text-xs text-slate-500">{t.text}</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    aria-label={t.title}
                    disabled={busy === t.type || consents.loading}
                    onClick={() => toggle(t.type)}
                    className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${on ? 'bg-indigo-600' : 'bg-slate-300'}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : ''}`} />
                  </button>
                </div>
              );
            })}
          </div>
        </Card>
        <Card title="Your data">
          <p className="mb-3 text-sm text-slate-600">Download everything we hold about you as a JSON file.</p>
          <Button variant="secondary" loading={busy === 'export'} onClick={download}>Download my data</Button>
          <hr className="my-5 border-slate-100" />
          <p className="mb-3 text-sm text-slate-600">Ask us to erase your personal data. An administrator reviews each request.</p>
          <Textarea label="Reason (optional)" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
          <Button className="mt-3" variant="danger" loading={busy === 'delete'} onClick={requestDeletion}>Request deletion</Button>
        </Card>
      </div>

      <Card title="Deletion requests">
        {requests.loading ? (
          <Loading />
        ) : !requests.data?.length ? (
          <Empty>No requests yet.</Empty>
        ) : (
          <Table head={['Requested', 'Type', 'Status', 'Completed']}>
            {requests.data.map((r) => (
              <tr key={r.id}>
                <td>{fmtDateTime(r.createdAt)}</td>
                <td>{label(r.type)}</td>
                <td><StatusBadge status={r.status} /></td>
                <td>{fmtDate(r.completedAt)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Card title="Consent history">
        {consents.loading ? (
          <Loading />
        ) : (
          <Table head={['Type', 'Policy', 'Given', 'Status']} empty={!consents.data?.length}>
            {consents.data?.map((c) => (
              <tr key={c.id}>
                <td className="font-medium text-slate-800">{label(c.type.split(':')[0])}</td>
                <td>{c.policyVersion}</td>
                <td>{fmtDateTime(c.createdAt)}</td>
                <td>{c.withdrawnAt ? <Badge>Withdrawn {fmtDate(c.withdrawnAt)}</Badge> : <Badge tone="green">Active</Badge>}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
