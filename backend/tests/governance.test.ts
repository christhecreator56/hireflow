import { beforeEach, describe, expect, it } from 'vitest';
import { API, applyAs, login, prisma, seedWorld } from './helpers.js';

let w: Awaited<ReturnType<typeof seedWorld>>;
beforeEach(async () => {
  w = await seedWorld();
});

describe('governance', () => {
  it('GET /me/export returns the candidate applications', async () => {
    const c = await login('cand@test.local');
    await applyAs(c, w.job.id);
    const res = await c.get(`${API}/me/export`);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe('cand@test.local');
    expect(res.body.profile.applications).toHaveLength(1);
    expect(res.body.profile.applications[0].job.title).toBe('Backend Engineer');
    expect(res.headers['content-disposition']).toContain('my-data.json');
  });

  it('deletion request -> employer approves -> PII wiped, application row kept', async () => {
    const c = await login('cand@test.local');
    const app = (await applyAs(c, w.job.id)).body;
    const dr = await c.post(`${API}/me/data-requests`).send({ reason: 'bye' });
    expect(dr.status).toBe(201);
    expect((await c.post(`${API}/me/data-requests`).send({})).status).toBe(409);

    const r = await login('recruiter@test.local');
    expect((await r.post(`${API}/admin/data-requests/${dr.body.id}/decide`).send({ approve: true })).status).toBe(403);

    const e = await login('employer@test.local');
    const res = await e.post(`${API}/admin/data-requests/${dr.body.id}/decide`).send({ approve: true });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('COMPLETED');

    const user = await prisma.user.findUniqueOrThrow({ where: { id: w.cand.id }, include: { profile: true } });
    expect(user.email).toMatch(/^deleted-.+@anonymized\.local$/);
    expect(user.isActive).toBe(false);
    expect(user.profile?.phone).toBeNull();
    expect(user.profile?.anonymizedAt).not.toBeNull();
    expect(await prisma.application.findUnique({ where: { id: app.id } })).not.toBeNull();
  });

  it('rejected deletion request leaves data intact', async () => {
    const c = await login('cand@test.local');
    const dr = await c.post(`${API}/me/data-requests`).send({});
    const e = await login('employer@test.local');
    await e.post(`${API}/admin/data-requests/${dr.body.id}/decide`).send({ approve: false });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: w.cand.id } })).email).toBe('cand@test.local');
  });

  it('retention run anonymizes old rejected applications only', async () => {
    await prisma.organization.update({ where: { id: w.org.id }, data: { retentionDays: 30 } });
    const c1 = await login('cand@test.local');
    const c2 = await login('cand2@test.local');
    const old = (await applyAs(c1, w.job.id)).body.id;
    await applyAs(c2, w.job.id); // still active: must survive
    const r = await login('recruiter@test.local');
    expect((await r.post(`${API}/applications/${old}/reject`).send({ reason: 'No match' })).status).toBe(200);
    // @updatedAt is auto-managed, so age the row via SQL
    await prisma.$executeRaw`UPDATE "Application" SET "updatedAt" = now() - interval '90 days' WHERE id = ${old}`;

    const e = await login('employer@test.local');
    expect((await r.post(`${API}/admin/retention/run`)).status).toBe(403);
    const res = await e.post(`${API}/admin/retention/run`);
    expect(res.status).toBe(200);
    expect(res.body.anonymized).toBe(1);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: w.cand.id } })).email).toMatch(/anonymized\.local$/);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: w.cand2.id } })).email).toBe('cand2@test.local');
    expect(await prisma.application.findUnique({ where: { id: old } })).not.toBeNull();
  });

  it('audit log lists actions for staff only', async () => {
    const e = await login('employer@test.local');
    const res = await e.get(`${API}/admin/audit-logs`);
    expect(res.status).toBe(200);
    const c = await login('cand@test.local');
    expect((await c.get(`${API}/admin/audit-logs`)).status).toBe(403);
  });
});

describe('resume upload', () => {
  it('PDF -> 201, TXT -> 400, no file -> 400', async () => {
    const c = await login('cand@test.local');
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
    const ok = await c.post(`${API}/me/resumes`).attach('file', pdf, { filename: 'cv.pdf', contentType: 'application/pdf' });
    expect(ok.status).toBe(201);
    expect(ok.body.fileName).toBe('cv.pdf');
    expect(await prisma.resume.count()).toBe(1);

    const txt = await c.post(`${API}/me/resumes`).attach('file', Buffer.from('hello'), { filename: 'cv.txt', contentType: 'text/plain' });
    expect(txt.status).toBe(400);
    expect((await c.post(`${API}/me/resumes`)).status).toBe(400);
    expect(await prisma.resume.count()).toBe(1);
  });
});
