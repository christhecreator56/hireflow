import { useRef, useState } from 'react';
import { api } from '../lib/api';
import type { Resume } from '../types';
import { Button, ErrorBox } from './ui';

const TYPES = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
const MAX = 5 * 1024 * 1024;

export function validateResume(f: File) {
  if (!TYPES.includes(f.type)) return 'Resume must be a PDF or DOCX file';
  if (f.size > MAX) return 'Resume must be 5 MB or smaller';
  return null;
}

export function ResumeUpload({ onUploaded }: { onUploaded: (r: Resume) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const upload = async (f: File) => {
    const invalid = validateResume(f);
    if (invalid) return setError(new Error(invalid));
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', f);
      onUploaded(await api<Resume>('/me/resumes', { body: fd }));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = '';
    }
  };

  return (
    <div className="space-y-2">
      <input
        ref={ref}
        type="file"
        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
      />
      <Button variant="secondary" loading={busy} onClick={() => ref.current?.click()}>
        Upload resume
      </Button>
      <p className="text-xs text-slate-500">PDF or DOCX, up to 5 MB.</p>
      <ErrorBox error={error} />
    </div>
  );
}
