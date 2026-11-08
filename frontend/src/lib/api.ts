export class ApiError extends Error {
  constructor(
    public status: number,
    public error: string,
    public details?: unknown,
  ) {
    super(error);
  }
}

type Opts = { method?: string; body?: unknown };

export async function api<T = unknown>(path: string, { method, body }: Opts = {}): Promise<T> {
  const isForm = body instanceof FormData;
  const res = await fetch(`/api/v1${path}`, {
    method: method ?? (body === undefined ? 'GET' : 'POST'),
    credentials: 'include',
    headers: body === undefined || isForm ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text };
  }
  if (!res.ok) {
    const d = (data ?? {}) as { error?: string; details?: unknown };
    throw new ApiError(res.status, d.error || res.statusText || 'Request failed', d.details);
  }
  // Carry the status so callers can tell 200 from 202 (approval required).
  if (data && typeof data === 'object') Object.defineProperty(data, '__status', { value: res.status });
  return data as T;
}

export const statusOf = (data: unknown) => (data as { __status?: number })?.__status;

/** Flattens zod fieldErrors / {missing: [...]} into readable lines. */
export function detailLines(details: unknown): string[] {
  if (!details || typeof details !== 'object') return [];
  return Object.entries(details as Record<string, unknown>).flatMap(([k, v]) => {
    const vals = Array.isArray(v) ? v.map(String) : [String(v)];
    return vals.length ? [`${k}: ${vals.join(', ')}`] : [];
  });
}

export function fieldError(err: unknown, field: string): string | undefined {
  if (!(err instanceof ApiError) || !err.details || typeof err.details !== 'object') return;
  const v = (err.details as Record<string, unknown>)[field];
  return Array.isArray(v) ? v.join(', ') : typeof v === 'string' ? v : undefined;
}
