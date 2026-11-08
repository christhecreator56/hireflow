import { beforeEach, describe, expect, it } from 'vitest';
import { API, applyAs, login, mkJob, prisma, seedWorld } from './helpers.js';

let w: Awaited<ReturnType<typeof seedWorld>>;
beforeEach(async () => {
  w = await seedWorld();
});

const jobBody = { title: 'Data Engineer', description: 'Pipelines and warehouses and more.' };

describe('validation', () => {
  it('salaryMin > salaryMax is 400', async () => {
    const r = await login('recruiter@test.local');
    const res = await r.post(`${API}/jobs`).send({ ...jobBody, salaryMin: 200, salaryMax: 100 });
    expect(res.status).toBe(400);
  });

  it('valid job creates with default stages and criteria', async () => {
    const r = await login('recruiter@test.local');
    const res = await r.post(`${API}/jobs`).send({ ...jobBody, salaryMin: 100, salaryMax: 200 });
    expect(res.status).toBe(201);
    expect(await prisma.jobStage.count({ where: { jobId: res.body.id } })).toBe(7);
    expect(await prisma.scorecardCriterion.count({ where: { jobId: res.body.id } })).toBe(4);
  });

  it('missing required answer is 400 with details.missing', async () => {
    const q = await prisma.jobQuestion.create({ data: { jobId: w.job.id, label: 'Why us?', type: 'TEXT', required: true, order: 0 } });
    const c = await login('cand@test.local');
    const res = await applyAs(c, w.job.id, { answers: {} });
    expect(res.status).toBe(400);
    expect(res.body.details.missing).toEqual(['Why us?']);
    const ok = await applyAs(c, w.job.id, { answers: { [q.id]: 'Because' } });
    expect(ok.status).toBe(201);
  });

  it('PATCH /me/profile with email is 400 (strict)', async () => {
    const c = await login('cand@test.local');
    expect((await c.patch(`${API}/me/profile`).send({ email: 'evil@x.y' })).status).toBe(400);
    expect((await c.patch(`${API}/me/profile`).send({ role: 'EMPLOYER' })).status).toBe(400);
    const ok = await c.patch(`${API}/me/profile`).send({ headline: 'Dev', skills: ['ts'] });
    expect(ok.status).toBe(200);
    expect(ok.body.headline).toBe('Dev');
  });
});

describe('job status machine & applying', () => {
  it('DRAFT -> PUBLISHED ok, CLOSED -> PUBLISHED 409', async () => {
    const r = await login('recruiter@test.local');
    const draft = await mkJob(w.org.id, w.recruiter.id, w.hm.id, 'DRAFT');
    const pub = await r.post(`${API}/jobs/${draft.id}/status`).send({ status: 'PUBLISHED' });
    expect(pub.status).toBe(200);
    expect(pub.body.publishedAt).toBeTruthy();
    expect((await r.post(`${API}/jobs/${draft.id}/status`).send({ status: 'CLOSED' })).status).toBe(200);
    expect((await r.post(`${API}/jobs/${draft.id}/status`).send({ status: 'PUBLISHED' })).status).toBe(409);
  });

  it('applying to a PAUSED job is 400', async () => {
    const r = await login('recruiter@test.local');
    await r.post(`${API}/jobs/${w.job.id}/status`).send({ status: 'PAUSED' });
    const c = await login('cand@test.local');
    expect((await applyAs(c, w.job.id)).status).toBe(400);
  });

  it('applying twice is 409', async () => {
    const c = await login('cand@test.local');
    expect((await applyAs(c, w.job.id)).status).toBe(201);
    expect((await applyAs(c, w.job.id)).status).toBe(409);
  });

  it('public job board lists only published jobs', async () => {
    await mkJob(w.org.id, w.recruiter.id, w.hm.id, 'DRAFT');
    const c = await login('cand@test.local');
    const res = await c.get(`${API}/public/jobs`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});
