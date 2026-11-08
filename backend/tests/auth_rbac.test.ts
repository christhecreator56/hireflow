import { beforeEach, describe, expect, it } from 'vitest';
import { API, PASSWORD, app, applyAs, login, prisma, request, seedWorld } from './helpers.js';

let w: Awaited<ReturnType<typeof seedWorld>>;
beforeEach(async () => {
  w = await seedWorld();
});

describe('auth', () => {
  const reg = { name: 'New Person', email: 'new@test.local', password: PASSWORD, consent: true };

  it('registers a candidate with consent and sets a session', async () => {
    const agent = request.agent(app);
    const res = await agent.post(`${API}/auth/register`).send(reg);
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('CANDIDATE');
    expect((await agent.get(`${API}/auth/me`)).status).toBe(200);
    expect(await prisma.consent.count({ where: { user: { email: reg.email }, type: 'DATA_PROCESSING' } })).toBe(1);
  });

  it('400 without consent', async () => {
    expect((await request(app).post(`${API}/auth/register`).send({ ...reg, consent: false })).status).toBe(400);
    expect((await request(app).post(`${API}/auth/register`).send({ ...reg, consent: undefined })).status).toBe(400);
  });

  it('409 on duplicate email', async () => {
    expect((await request(app).post(`${API}/auth/register`).send(reg)).status).toBe(201);
    expect((await request(app).post(`${API}/auth/register`).send(reg)).status).toBe(409);
  });

  it('logs in with good creds, 401 on bad', async () => {
    expect((await request(app).post(`${API}/auth/login`).send({ email: 'cand@test.local', password: PASSWORD })).status).toBe(200);
    expect((await request(app).post(`${API}/auth/login`).send({ email: 'cand@test.local', password: 'wrongwrong' })).status).toBe(401);
    expect((await request(app).post(`${API}/auth/login`).send({ email: 'nobody@test.local', password: PASSWORD })).status).toBe(401);
  });

  it('GET /auth/me without cookie is 401', async () => {
    expect((await request(app).get(`${API}/auth/me`)).status).toBe(401);
  });

  it('inactive user cannot log in', async () => {
    await prisma.user.update({ where: { email: 'cand@test.local' }, data: { isActive: false } });
    expect((await request(app).post(`${API}/auth/login`).send({ email: 'cand@test.local', password: PASSWORD })).status).toBe(401);
  });

  it('logout clears the session', async () => {
    const a = await login('cand@test.local');
    await a.post(`${API}/auth/logout`);
    expect((await a.get(`${API}/auth/me`)).status).toBe(401);
  });
});

describe('RBAC', () => {
  it('candidate is 403 on staff endpoints', async () => {
    const c = await login('cand@test.local');
    expect((await c.get(`${API}/reports/overview`)).status).toBe(403);
    expect((await c.get(`${API}/jobs`)).status).toBe(403);
    expect((await c.post(`${API}/jobs`).send({})).status).toBe(403);
  });

  it('hiring manager cannot see another manager job applications', async () => {
    const other = await login('hm2@test.local');
    expect((await other.get(`${API}/jobs/${w.job.id}/applications`)).status).toBe(403);
    const own = await login('hm@test.local');
    expect((await own.get(`${API}/jobs/${w.job.id}/applications`)).status).toBe(200);
  });

  it('candidate cannot withdraw another candidate application', async () => {
    const c1 = await login('cand@test.local');
    const res = await applyAs(c1, w.job.id);
    expect(res.status).toBe(201);
    const c2 = await login('cand2@test.local');
    expect((await c2.post(`${API}/me/applications/${res.body.id}/withdraw`)).status).toBe(403);
    expect((await c1.post(`${API}/me/applications/${res.body.id}/withdraw`)).status).toBe(200);
  });

  it('recruiter cannot create users; employer can', async () => {
    const body = { name: 'Staff Two', email: 'staff2@test.local', role: 'RECRUITER', password: PASSWORD };
    const r = await login('recruiter@test.local');
    expect((await r.post(`${API}/users`).send(body)).status).toBe(403);
    const e = await login('employer@test.local');
    expect((await e.post(`${API}/users`).send(body)).status).toBe(201);
  });
});
