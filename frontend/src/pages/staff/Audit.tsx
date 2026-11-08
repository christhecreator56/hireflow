import { Fragment, useState } from 'react';
import { useApi } from '../../lib/useApi';
import { fmtDateTime, label } from '../../lib/format';
import { Button, Card, ErrorBox, Input, Loading, PageHeader, Select, Table } from '../../components/ui';

type Log = { id: string; actorName: string; actorRole: string | null; action: string; entityType: string; entityId: string | null; before: unknown; after: unknown; ip: string | null; createdAt: string };
type Page = { page: number; pageSize: number; total: number; items: Log[] };

const ENTITIES = ['Application', 'Job', 'User', 'CandidateProfile', 'Resume', 'Interview', 'Scorecard', 'StageApproval', 'Note', 'EmailTemplate', 'Organization', 'DataRequest', 'Consent', 'PipelineTemplate'];

export function Audit() {
  const [entityType, setEntityType] = useState('');
  const [action, setAction] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const qs = new URLSearchParams({ page: String(page), pageSize: '25', ...(entityType && { entityType }), ...(action && { action: action.toUpperCase() }) });
  const { data, error, loading } = useApi<Page>(`/admin/audit-logs?${qs}`);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div>
      <PageHeader title="Audit log" subtitle="Every create, change, view of a resume and decision, with before/after snapshots." />
      <Card
        title={data ? `${data.total} events` : 'Events'}
        actions={
          <>
            <div className="w-44">
              <Select aria-label="Entity type" value={entityType} onChange={(e) => { setEntityType(e.target.value); setPage(1); }}>
                <option value="">All entities</option>
                {ENTITIES.map((e) => <option key={e} value={e}>{e}</option>)}
              </Select>
            </div>
            <div className="w-44">
              <Input aria-label="Action" placeholder="Action e.g. MOVE_STAGE" value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} />
            </div>
          </>
        }
      >
        <ErrorBox error={error} />
        {loading && !data ? (
          <Loading />
        ) : (
          <Table head={['When', 'Actor', 'Action', 'Entity', '']} empty={!data?.items.length}>
            {data?.items.map((l) => {
              const hasDiff = l.before != null || l.after != null;
              return (
                <Fragment key={l.id}>
                  <tr className={open === l.id ? 'bg-slate-50' : undefined}>
                    <td className="whitespace-nowrap text-slate-500">{fmtDateTime(l.createdAt)}</td>
                    <td className="whitespace-nowrap">
                      {l.actorName} <span className="text-xs text-slate-400">{label(l.actorRole)}</span>
                    </td>
                    <td><span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">{l.action}</span></td>
                    <td className="whitespace-nowrap">
                      {l.entityType} <span className="font-mono text-xs text-slate-400">{l.entityId?.slice(-8)}</span>
                    </td>
                    <td className="text-right">
                      {hasDiff && (
                        <Button size="sm" variant="ghost" aria-expanded={open === l.id} onClick={() => setOpen(open === l.id ? null : l.id)}>
                          {open === l.id ? 'Hide' : 'Details'}
                        </Button>
                      )}
                    </td>
                  </tr>
                  {open === l.id && (
                    <tr className="bg-slate-50">
                      <td colSpan={5}>
                        <div className="grid gap-3 md:grid-cols-2">
                          {(['before', 'after'] as const).map((k) => (
                            <div key={k} className="min-w-0">
                              <p className="mb-1 text-xs font-semibold text-slate-500 uppercase">{k}</p>
                              <pre className="max-h-72 overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">{l[k] == null ? '—' : JSON.stringify(l[k], null, 2)}</pre>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </Table>
        )}
        <div className="mt-4 flex items-center justify-end gap-2">
          <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
          <span className="text-xs text-slate-500">Page {page} of {pages}</span>
          <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      </Card>
    </div>
  );
}
