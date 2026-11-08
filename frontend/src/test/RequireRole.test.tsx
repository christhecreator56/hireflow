import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { AuthProvider, RequireRole } from '../lib/auth';

function renderAt(path: string, me: { status: number; body: unknown }) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(me.body), { status: me.status })));
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="/dashboard" element={<RequireRole roles={['RECRUITER']}><p>Staff area</p></RequireRole>} />
          <Route path="/portal" element={<p>Candidate portal</p>} />
          <Route path="/login" element={<p>Login page</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('RequireRole', () => {
  it('redirects anonymous visitors to /login', async () => {
    renderAt('/dashboard', { status: 401, body: { error: 'Authentication required' } });
    expect(await screen.findByText('Login page')).toBeInTheDocument();
  });

  it('sends a candidate to their own home', async () => {
    renderAt('/dashboard', { status: 200, body: { user: { id: 'u', role: 'CANDIDATE', name: 'C', email: 'c@x', orgId: null }, org: null } });
    expect(await screen.findByText('Candidate portal')).toBeInTheDocument();
  });

  it('renders the page for an allowed role', async () => {
    renderAt('/dashboard', { status: 200, body: { user: { id: 'u', role: 'RECRUITER', name: 'R', email: 'r@x', orgId: 'o' }, org: { id: 'o', name: 'Acme', retentionDays: 180 } } });
    expect(await screen.findByText('Staff area')).toBeInTheDocument();
  });
});
