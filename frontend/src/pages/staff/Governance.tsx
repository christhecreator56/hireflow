import { useEffect, useState } from 'react';
import { api, fieldError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useApi } from '../../lib/useApi';
import { fmtDateTime } from '../../lib/format';
import { Button, Card, ErrorBox, Input, Loading, PageHeader, StatusBadge, Table } from '../../components/ui';
import { useToast } from '../../components/toast';

type DataRequest = { id: string; type: string; status: string; reason: string | null; createdAt: string; completedAt: string | null; user: { name: string; email: string } };

export function Governance() {
  const { org, refresh } = useAuth();
  const toast = useToast();
  const requests = useApi<DataRequest[]>('/admin/data-requests');
  const [days, setDays] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<unknown>(null);

  useEffect(() => setDays(org?.retentionDays.toString() ?? ''), [org]);

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

  const saveRetention = () =>
    run('save', async () => {
      await api('/admin/org', { method: 'PATCH', body: { retentionDays: Number(days) } });
      await refresh();
      toast('Retention period saved');
    });

  const runRetention = () =>
    run('run', async () => {
      if (!confirm('Anonymise all candidates whose data is older than the retention period now?')) return;
      setResult(await api('/admin/retention/run', { method: 'POST' }));
      toast('Retention run complete');
    });

  const decide = (r: DataRequest, approve: boolean) =>
    run(r.id, async () => {
      if (approve && !confirm(`Anonymise all personal data for ${r.user.name}? This cannot be undone.`)) return;
      await api(`/admin/data-requests/${r.id}/decide`, { body: { approve } });
      toast(approve ? 'Candidate data anonymised' : 'Request rejected');
      requests.reload();
    });

  return (
    <div>
      <PageHeader title="Data governance" subtitle="Retention policy and candidate erasure requests (GDPR / DPDP)." />
      <div className="mb-4">
        <ErrorBox error={error} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Retention period">
          <p className="mb-3 text-sm text-slate-600">Candidates with no activity for longer than this are anonymised automatically each night.</p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-40">
              <Input label="Days" type="number" min={30} max={3650} value={days} onChange={(e) => setDays(e.target.value)} error={fieldError(error, 'retentionDays')} />
            </div>
            <Button loading={busy === 'save'} onClick={saveRetention}>Save</Button>
          </div>
        </Card>
        <Card title="Run retention now">
          <p className="mb-3 text-sm text-slate-600">Apply the retention policy immediately instead of waiting for the nightly job.</p>
          <Button variant="danger" loading={busy === 'run'} onClick={runRetention}>Run retention now</Button>
          {result != null && <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">{JSON.stringify(result, null, 2)}</pre>}
        </Card>
      </div>
      <Card title="Deletion requests" className="mt-6">
        {requests.loading ? (
          <Loading />
        ) : (
          <Table head={['Candidate', 'Requested', 'Reason', 'Status', '']} empty={!requests.data?.length}>
            {requests.data?.map((r) => (
              <tr key={r.id}>
                <td>
                  <p className="font-medium text-slate-800">{r.user.name}</p>
                  <p className="text-xs text-slate-500">{r.user.email}</p>
                </td>
                <td className="whitespace-nowrap text-slate-500">{fmtDateTime(r.createdAt)}</td>
                <td className="max-w-64 text-slate-600">{r.reason ?? '—'}</td>
                <td><StatusBadge status={r.status} /></td>
                <td>
                  {r.status === 'PENDING' && (
                    <div className="flex justify-end gap-1.5">
                      <Button size="sm" loading={busy === r.id} onClick={() => decide(r, true)}>Approve & anonymise</Button>
                      <Button size="sm" variant="secondary" disabled={busy === r.id} onClick={() => decide(r, false)}>Reject</Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
