import { useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { ApiError, detailLines } from '../lib/api';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
const variants: Record<Variant, string> = {
  primary: 'bg-slate-900 text-white hover:bg-slate-700 shadow-[0_8px_20px_-10px_rgb(27_26_24/.6)]',
  secondary: 'bg-white text-slate-800 hover:bg-slate-50 shadow-[0_6px_16px_-10px_rgb(27_26_24/.35)]',
  danger: 'bg-white/70 text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-50',
  ghost: 'text-slate-600 hover:bg-black/5',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md'; loading?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      disabled={props.disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-full font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'px-3 py-1 text-xs' : 'px-5 py-2.5 text-sm',
        variants[variant],
        className,
      )}
    >
      {loading && <Spinner className="size-3.5" />}
      {children}
    </button>
  );
}

const field =
  'block w-full rounded-2xl border-0 bg-white/80 px-4 py-2.5 text-sm text-slate-900 ring-1 ring-black/5 placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-indigo-400 focus:outline-none disabled:bg-slate-100';

type FieldProps = { label?: string; error?: string; hint?: string };

function Wrap({ label, error, hint, children }: FieldProps & { children: ReactNode }) {
  return (
    <label className="block min-w-0">
      {label && <span className="mb-1.5 block text-xs font-medium tracking-wide text-slate-500">{label}</span>}
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}

export function Input({ label, error, hint, className, ...props }: InputHTMLAttributes<HTMLInputElement> & FieldProps) {
  return (
    <Wrap label={label} error={error} hint={hint}>
      <input {...props} className={cx(field, error && 'ring-red-400', className)} />
    </Wrap>
  );
}

export function Textarea({ label, error, hint, className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & FieldProps) {
  return (
    <Wrap label={label} error={error} hint={hint}>
      <textarea rows={4} {...props} className={cx(field, error && 'ring-red-400', className)} />
    </Wrap>
  );
}

export function Select({ label, error, hint, className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & FieldProps) {
  return (
    <Wrap label={label} error={error} hint={hint}>
      <select {...props} className={cx(field, 'rounded-full pr-9', error && 'ring-red-400', className)}>
        {children}
      </select>
    </Wrap>
  );
}

export function Checkbox({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return (
    <label className="flex items-start gap-2 text-sm text-slate-700">
      <input type="checkbox" {...props} className="mt-0.5 size-4 shrink-0 rounded border-slate-300 accent-indigo-600" />
      <span>{label}</span>
    </label>
  );
}

export function Card({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('surface min-w-0', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 px-5 pt-5 sm:px-6">
          <h2 className="text-base font-medium text-slate-900">{title}</h2>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className="p-5 sm:p-6">{children}</div>
    </section>
  );
}

const tones = {
  gray: 'bg-black/5 text-slate-700 ring-transparent',
  indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-100',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  amber: 'bg-amber-50 text-amber-800 ring-amber-100',
  red: 'bg-red-50 text-red-700 ring-red-100',
  blue: 'bg-white text-slate-700 ring-black/5',
};
export type Tone = keyof typeof tones;

export function Badge({ tone = 'gray', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={cx('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset', tones[tone])}>
      {children}
    </span>
  );
}

const STATUS_TONE: Record<string, Tone> = {
  PUBLISHED: 'green', DRAFT: 'gray', PAUSED: 'amber', CLOSED: 'red',
  ACTIVE: 'indigo', HIRED: 'green', REJECTED: 'red', WITHDRAWN: 'gray',
  PENDING: 'amber', APPROVED: 'green', COMPLETED: 'green', SCHEDULED: 'blue', CANCELLED: 'gray',
  SENT: 'green', QUEUED: 'amber', FAILED: 'red',
};
export const StatusBadge = ({ status }: { status: string }) => (
  <Badge tone={STATUS_TONE[status] ?? 'gray'}>{status.replace(/_/g, ' ').toLowerCase()}</Badge>
);

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/30 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
        className={cx('flex max-h-[92vh] w-full flex-col fade-in rounded-t-[28px] bg-[var(--panel)] shadow-2xl sm:rounded-[28px]', wide ? 'sm:max-w-2xl' : 'sm:max-w-lg')}
      >
        <header className="flex items-center justify-between px-6 pt-5 pb-2">
          <h2 className="text-lg font-medium text-slate-900">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-8 place-items-center rounded-full bg-black/5 text-slate-500 hover:bg-black/10">
            ✕
          </button>
        </header>
        <div className="overflow-y-auto px-6 py-4">{children}</div>
        {footer && <footer className="flex justify-end gap-2 px-6 pt-2 pb-5">{footer}</footer>}
      </div>
    </div>
  );
}

export function Table({ head, children, empty }: { head: ReactNode[]; children: ReactNode; empty?: boolean }) {
  return (
    <div className="-mx-5 overflow-x-auto sm:-mx-6">
      <table className="min-w-full text-sm">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={i} className="px-5 py-2.5 text-left text-[11px] font-medium tracking-wider whitespace-nowrap text-slate-400 uppercase sm:px-6">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-black/5 [&_td]:px-5 [&_td]:py-3 sm:[&_td]:px-6">{children}</tbody>
      </table>
      {empty && (
        <div className="px-5 sm:px-6">
          <Empty>Nothing here yet.</Empty>
        </div>
      )}
    </div>
  );
}

export const Spinner = ({ className = 'size-5' }: { className?: string }) => (
  <svg className={cx('animate-spin', className)} viewBox="0 0 24 24" fill="none" aria-hidden>
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity=".25" strokeWidth="4" />
    <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
  </svg>
);

export const Loading = () => (
  <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
    <Spinner /> Loading…
  </div>
);

export const Empty = ({ children }: { children: ReactNode }) => (
  <div className="rounded-3xl border border-dashed border-black/10 px-4 py-10 text-center text-sm text-slate-500">{children}</div>
);

/** Shows the API message plus every field-level detail it returned. */
export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null;
  const msg = error instanceof Error ? error.message : String(error);
  const lines = error instanceof ApiError ? detailLines(error.details) : [];
  return (
    <div role="alert" className="rounded-2xl bg-red-50 px-4 py-2.5 text-sm text-red-700 ring-1 ring-red-100">
      <p className="font-medium">{msg}</p>
      {lines.length > 0 && (
        <ul className="mt-1 list-disc pl-5 text-xs">
          {lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-3xl font-light tracking-tight text-slate-900 sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** Text input that turns Enter/comma into removable chips. */
export function ChipsInput({ label, value, onChange, placeholder }: { label?: string; value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const add = (raw: string) => {
    const v = raw.trim();
    if (v && !value.includes(v)) onChange([...value, v]);
  };
  return (
    <Wrap label={label}>
      <div className="flex flex-wrap gap-1.5 rounded-2xl bg-white/80 px-3 py-2 ring-1 ring-black/5 focus-within:ring-2 focus-within:ring-indigo-400">
        {value.map((s) => (
          <span key={s} className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-2.5 py-0.5 text-xs text-white">
            {s}
            <button type="button" aria-label={`Remove ${s}`} onClick={() => onChange(value.filter((x) => x !== s))} className="text-white/60 hover:text-white">
              ×
            </button>
          </span>
        ))}
        <input
          className="min-w-24 flex-1 border-0 bg-transparent p-0.5 text-sm outline-none"
          placeholder={placeholder ?? 'Type and press Enter'}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              add(e.currentTarget.value);
              e.currentTarget.value = '';
            } else if (e.key === 'Backspace' && !e.currentTarget.value && value.length) onChange(value.slice(0, -1));
          }}
          onBlur={(e) => {
            add(e.currentTarget.value);
            e.currentTarget.value = '';
          }}
        />
      </div>
    </Wrap>
  );
}

/** Share of a job's skills the candidate has (0–100), or null when the job lists none. */
export function skillMatch(have: string[], want: string[]) {
  if (!want.length) return null;
  const mine = new Set(have.map((x) => x.toLowerCase()));
  return Math.round((100 * want.filter((x) => mine.has(x.toLowerCase())).length) / want.length);
}

export const matchLabel = (p: number) => (p >= 75 ? 'Strong match' : p >= 50 ? 'Good match' : p > 0 ? 'Partial match' : 'No overlap');

/** Ring gauge: coral arc when highlighted, white arc otherwise, over a dotted track. */
export function MatchRing({ value, size = 120, highlight, caption }: { value: number; size?: number; highlight?: boolean; caption?: string }) {
  const stroke = Math.max(3, size / 24);
  const r = (size - stroke) / 2 - 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const small = size < 70;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${v}% ${caption ?? 'match'}`}>
      <svg viewBox={`0 0 ${size} ${size}`} className="-rotate-90" width={size} height={size} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={1.2} strokeDasharray="1.2 4" className="text-slate-400" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${(v / 100) * c} ${c}`}
          className={cx('ring-draw', highlight ? 'stroke-indigo-600' : 'stroke-[var(--ring-soft)]')}
          style={{ transition: 'stroke-dasharray .8s ease' }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <span className={cx('font-light tracking-tight text-slate-900 tabular-nums', small ? 'text-sm' : 'text-3xl')}>
            {v}
            <span className={small ? 'text-[9px]' : 'text-base'}>%</span>
          </span>
          {!small && caption && <p className="mt-0.5 text-[10px] text-slate-500">{caption}</p>}
        </div>
      </div>
    </div>
  );
}
