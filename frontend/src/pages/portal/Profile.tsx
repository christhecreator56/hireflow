import { useEffect, useState } from 'react';
import { api, fieldError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useApi } from '../../lib/useApi';
import { fmtDate } from '../../lib/format';
import type { Resume } from '../../types';
import { Button, Card, ChipsInput, Empty, ErrorBox, Input, Loading } from '../../components/ui';
import { ResumeUpload } from '../../components/ResumeUpload';
import { useToast } from '../../components/toast';

type ProfileData = {
  phone: string | null;
  location: string | null;
  linkedin: string | null;
  headline: string | null;
  skills: string[];
  experienceYears: number | null;
  user: { name: string; email: string };
  resumes: Resume[];
};

export async function openResume(path: string) {
  // Open the tab synchronously so pop-up blockers allow it, then point it at the signed URL.
  const w = window.open('', '_blank');
  try {
    const { url } = await api<{ url: string }>(path);
    if (w) w.location.href = url;
    else window.location.href = url;
  } catch (e) {
    w?.close();
    alert(e instanceof Error ? e.message : 'Could not open resume');
  }
}

export function Profile() {
  const { data, error, loading, setData } = useApi<ProfileData>('/me/profile');
  const { refresh } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ name: '', phone: '', location: '', linkedin: '', headline: '', experienceYears: '', skills: [] as string[] });
  const [saveError, setSaveError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data)
      setForm({
        name: data.user.name,
        phone: data.phone ?? '',
        location: data.location ?? '',
        linkedin: data.linkedin ?? '',
        headline: data.headline ?? '',
        experienceYears: data.experienceYears?.toString() ?? '',
        skills: data.skills,
      });
  }, [data]);

  if (loading) return <Loading />;
  if (error || !data) return <ErrorBox error={error} />;

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });
  const orNull = (s: string) => s.trim() || null;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setSaveError(null);
    try {
      await api('/me/profile', {
        method: 'PATCH',
        body: {
          name: form.name,
          phone: orNull(form.phone),
          location: orNull(form.location),
          linkedin: orNull(form.linkedin),
          headline: orNull(form.headline),
          skills: form.skills,
          experienceYears: form.experienceYears === '' ? null : Number(form.experienceYears),
        },
      });
      await refresh();
      toast('Profile saved');
    } catch (err) {
      setSaveError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <Card title="Profile">
        <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <ErrorBox error={saveError} />
          </div>
          <Input label="Full name" value={form.name} onChange={set('name')} error={fieldError(saveError, 'name')} />
          <Input label="Email" value={data.user.email} disabled />
          <Input label="Phone" value={form.phone} onChange={set('phone')} error={fieldError(saveError, 'phone')} />
          <Input label="Location" value={form.location} onChange={set('location')} error={fieldError(saveError, 'location')} />
          <Input label="LinkedIn URL" type="url" placeholder="https://linkedin.com/in/…" value={form.linkedin} onChange={set('linkedin')} error={fieldError(saveError, 'linkedin')} />
          <Input label="Years of experience" type="number" min={0} max={60} value={form.experienceYears} onChange={set('experienceYears')} error={fieldError(saveError, 'experienceYears')} />
          <div className="sm:col-span-2">
            <Input label="Headline" placeholder="e.g. Frontend engineer who loves accessible UI" value={form.headline} onChange={set('headline')} error={fieldError(saveError, 'headline')} />
          </div>
          <div className="sm:col-span-2">
            <ChipsInput label="Skills" value={form.skills} onChange={(skills) => setForm({ ...form, skills })} />
            {fieldError(saveError, 'skills') && <p className="mt-1 text-xs text-red-600">{fieldError(saveError, 'skills')}</p>}
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" loading={busy}>Save profile</Button>
          </div>
        </form>
      </Card>
      <Card title="Resumes">
        <ResumeUpload
          onUploaded={(r) => {
            setData({ ...data, resumes: [r, ...data.resumes] });
            toast('Resume uploaded');
          }}
        />
        <div className="mt-4">
          {data.resumes.length === 0 ? (
            <Empty>No resumes yet.</Empty>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.resumes.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">{r.fileName}</p>
                    <p className="text-xs text-slate-500">{(r.size / 1024).toFixed(0)} KB · {fmtDate(r.uploadedAt)}</p>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => openResume(`/me/resumes/${r.id}/url`)}>View</Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
}
