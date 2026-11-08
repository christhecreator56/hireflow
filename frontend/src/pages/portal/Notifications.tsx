import { useState } from 'react';
import { api } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import { fmtDateTime } from '../../lib/format';
import { Button, Card, Empty, ErrorBox, Loading } from '../../components/ui';

type Notification = { id: string; message: string; read: boolean; createdAt: string };

export function Notifications() {
  const { data, error, loading, setData } = useApi<Notification[]>('/me/notifications');
  const [busy, setBusy] = useState(false);
  const unread = data?.filter((n) => !n.read).length ?? 0;

  const markRead = async () => {
    setBusy(true);
    try {
      await api('/me/notifications/read', { method: 'POST' });
      setData(data!.map((n) => ({ ...n, read: true })));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      title={`Notifications${unread ? ` (${unread} unread)` : ''}`}
      actions={unread > 0 && <Button size="sm" variant="secondary" loading={busy} onClick={markRead}>Mark all as read</Button>}
    >
      <ErrorBox error={error} />
      {loading ? (
        <Loading />
      ) : !data?.length ? (
        <Empty>No notifications yet.</Empty>
      ) : (
        <ul className="divide-y divide-slate-100">
          {data.map((n) => (
            <li key={n.id} className="flex items-start gap-3 py-3">
              <span className={`mt-1.5 size-2 shrink-0 rounded-full ${n.read ? 'bg-slate-200' : 'bg-indigo-600'}`} />
              <div className="min-w-0">
                <p className={`text-sm ${n.read ? 'text-slate-600' : 'font-medium text-slate-900'}`}>{n.message}</p>
                <p className="text-xs text-slate-400">{fmtDateTime(n.createdAt)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
