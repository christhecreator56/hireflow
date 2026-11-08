import { useState } from 'react';
import { Link } from 'react-router';
import { api } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import { fmtDateTime, label } from '../../lib/format';
import { Button, Card, cx, Empty, ErrorBox, Input, Loading, PageHeader, StatusBadge } from '../../components/ui';
import { useToast } from '../../components/toast';

type Approval = {
  id: string;
  status: string;
  comment: string | null;
  createdAt: string;
  targetStage: { name: string; approverRole: string | null };
  application: { id: string; job: { id: string; title: string }; currentStage: { name: string }; candidate: { user: { name: string } } };
};

const TABS = ['PENDING', 'APPROVED', 'REJECTED'];

export function Approvals() {
  const [tab, setTab] = useState('PENDING');
  const { data, error, loading, reload } = useApi<Approval[]>(`/approvals?status=${tab}`);
  const toast = useToast();
  const [comments, setComments] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<unknown>(null);

  const decide = async (a: Approval, approve: boolean) => {
    setBusy(a.id + approve);
    setActionError(null);
    try {
      await api(`/approvals/${a.id}/decide`, { body: { approve, comment: comments[a.id] || undefined } });
      toast(approve ? `Approved: ${a.application.candidate.user.name} moved to ${a.targetStage.name}` : 'Request denied', approve ? 'success' : 'info');
      reload();
    } catch (e) {
      setActionError(e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <PageHeader title="Approvals" subtitle="Stage moves that need your sign-off." />
      <div className="mb-4 flex gap-1">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cx('rounded-full px-3 py-1.5 text-sm font-medium', tab === t ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100')}
          >
            {label(t)}
          </button>
        ))}
      </div>
      <div className="space-y-3">
        <ErrorBox error={error ?? actionError} />
        {loading ? (
          <Loading />
        ) : !data?.length ? (
          <Empty>{tab === 'PENDING' ? 'Nothing waiting for you.' : 'No approvals here.'}</Empty>
        ) : (
          data.map((a) => (
            <Card key={a.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link to={`/applications/${a.application.id}`} className="font-medium text-slate-900 hover:text-indigo-700">{a.application.candidate.user.name}</Link>
                  <p className="text-sm text-slate-600">
                    {a.application.job.title}: <strong>{a.application.currentStage.name}</strong> → <strong>{a.targetStage.name}</strong>
                  </p>
                  <p className="text-xs text-slate-500">Requested {fmtDateTime(a.createdAt)} · approver {label(a.targetStage.approverRole)}</p>
                  {a.comment && <p className="mt-1 text-sm text-slate-600 italic">“{a.comment}”</p>}
                </div>
                <StatusBadge status={a.status} />
              </div>
              {a.status === 'PENDING' && (
                <div className="mt-4 flex flex-wrap items-end gap-2">
                  <div className="min-w-48 flex-1">
                    <Input aria-label="Comment" placeholder="Comment (optional)" value={comments[a.id] ?? ''} onChange={(e) => setComments({ ...comments, [a.id]: e.target.value })} />
                  </div>
                  <Button loading={busy === a.id + true} onClick={() => decide(a, true)}>Approve</Button>
                  <Button variant="danger" loading={busy === a.id + false} onClick={() => decide(a, false)}>Deny</Button>
                </div>
              )}
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
