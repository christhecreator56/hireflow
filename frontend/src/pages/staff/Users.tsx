import { useState } from 'react';
import { api, fieldError } from '../../lib/api';
import { useAuth, type Role } from '../../lib/auth';
import { useApi } from '../../lib/useApi';
import { fmtDate, label } from '../../lib/format';
import type { StaffUser } from '../../types';
import { Badge, Button, Card, ErrorBox, Input, Loading, Modal, PageHeader, Select, Table } from '../../components/ui';
import { useToast } from '../../components/toast';

const ROLES: Role[] = ['EMPLOYER', 'RECRUITER', 'HIRING_MANAGER'];

export function Users() {
  const { user: me } = useAuth();
  const { data, error, loading, setData } = useApi<StaffUser[]>('/users');
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [actionError, setActionError] = useState<unknown>(null);
  const staff = data?.filter((u) => u.role !== 'CANDIDATE') ?? [];

  const patch = async (u: StaffUser, body: Partial<StaffUser>) => {
    setActionError(null);
    try {
      const updated = await api<StaffUser>(`/users/${u.id}`, { method: 'PATCH', body });
      setData(data!.map((x) => (x.id === u.id ? updated : x)));
      toast(`${u.name} updated`);
    } catch (e) {
      setActionError(e);
    }
  };

  return (
    <div>
      <PageHeader title="Team" subtitle="Staff accounts for your organisation." actions={<Button onClick={() => setCreating(true)}>+ Add staff user</Button>} />
      <Card>
        <ErrorBox error={error ?? actionError} />
        {loading ? (
          <Loading />
        ) : (
          <Table head={['Name', 'Role', 'Status', 'Added', '']} empty={!staff.length}>
            {staff.map((u) => (
              <tr key={u.id}>
                <td>
                  <p className="font-medium text-slate-800">{u.name}{u.id === me?.id && <span className="ml-1 text-xs text-slate-400">(you)</span>}</p>
                  <p className="text-xs text-slate-500">{u.email}</p>
                </td>
                <td>
                  <div className="w-44">
                    <Select aria-label={`Role for ${u.name}`} value={u.role} disabled={u.id === me?.id} onChange={(e) => patch(u, { role: e.target.value as Role })}>
                      {ROLES.map((r) => <option key={r} value={r}>{label(r)}</option>)}
                    </Select>
                  </div>
                </td>
                <td>{u.isActive ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}</td>
                <td className="whitespace-nowrap text-slate-500">{fmtDate(u.createdAt)}</td>
                <td className="text-right">
                  {u.id !== me?.id && (
                    <Button size="sm" variant={u.isActive ? 'danger' : 'secondary'} onClick={() => patch(u, { isActive: !u.isActive })}>
                      {u.isActive ? 'Deactivate' : 'Activate'}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      {creating && (
        <CreateUser
          onClose={() => setCreating(false)}
          onCreated={(u) => {
            setData([...(data ?? []), u].sort((a, b) => a.name.localeCompare(b.name)));
            setCreating(false);
            toast('Staff user created');
          }}
        />
      )}
    </div>
  );
}

function CreateUser({ onClose, onCreated }: { onClose: () => void; onCreated: (u: StaffUser) => void }) {
  const [f, setF] = useState({ name: '', email: '', role: 'RECRUITER', password: '' });
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      onCreated(await api<StaffUser>('/users', { body: f }));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title="Add staff user" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={submit}>Create user</Button></>}>
      <div className="space-y-4">
        <ErrorBox error={error} />
        <Input label="Name" value={f.name} onChange={set('name')} error={fieldError(error, 'name')} />
        <Input label="Email" type="email" value={f.email} onChange={set('email')} error={fieldError(error, 'email')} />
        <Select label="Role" value={f.role} onChange={set('role')}>
          {ROLES.map((r) => <option key={r} value={r}>{label(r)}</option>)}
        </Select>
        <Input label="Initial password" type="password" hint="At least 8 characters; share it securely." value={f.password} onChange={set('password')} error={fieldError(error, 'password')} />
      </div>
    </Modal>
  );
}
