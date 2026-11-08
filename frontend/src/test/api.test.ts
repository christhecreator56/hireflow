import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, detailLines, fieldError, statusOf } from '../lib/api';

const mockFetch = (status: number, body: unknown) =>
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body === undefined ? null : JSON.stringify(body), { status })));

afterEach(() => vi.unstubAllGlobals());

describe('api()', () => {
  it('sends JSON with credentials and returns parsed data plus status', async () => {
    mockFetch(202, { moved: false, approvalId: 'a1' });
    const res = await api<{ moved: boolean }>('/applications/1/move', { body: { toStageId: 's' } });
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('/api/v1/applications/1/move');
    expect(init).toMatchObject({ method: 'POST', credentials: 'include', body: '{"toStageId":"s"}' });
    expect(res.moved).toBe(false);
    expect(statusOf(res)).toBe(202);
  });

  it('throws ApiError carrying status, error and details', async () => {
    mockFetch(400, { error: 'Validation failed', details: { email: ['Invalid email'], name: ['Too short'] } });
    const err = (await api('/auth/register', { body: {} }).catch((e) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 400, error: 'Validation failed', message: 'Validation failed' });
    expect(fieldError(err, 'email')).toBe('Invalid email');
    expect(detailLines(err.details)).toEqual(['email: Invalid email', 'name: Too short']);
  });

  it('handles empty 204 bodies and non-JSON errors', async () => {
    mockFetch(204, undefined);
    await expect(api('/auth/logout', { method: 'POST' })).resolves.toBeNull();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Bad Gateway', { status: 502 })));
    await expect(api('/x')).rejects.toMatchObject({ status: 502, error: 'Bad Gateway' });
  });
});
