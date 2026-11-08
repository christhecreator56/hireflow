import { beforeEach, describe, expect, it } from 'vitest';
import { API, applyAs, login, mkJob, prisma, seedWorld, stageId } from './helpers.js';

let w: Awaited<ReturnType<typeof seedWorld>>;
let appId: string;
beforeEach(async () => {
  w = await seedWorld();
  const c = await login('cand@test.local');
  appId = (await applyAs(c, w.job.id)).body.id;
});

describe('moving applications', () => {
  it('moves and records a StageTransition + audit MOVE_STAGE', async () => {
    const r = await login('recruiter@test.local');
    const to = stageId(w.job, 'Screening');
    const res = await r.post(`${API}/applications/${appId}/move`).send({ toStageId: to });
    expect(res.status).toBe(200);
    expect(res.body.moved).toBe(true);
    const app = await prisma.application.findUniqueOrThrow({ where: { id: appId } });
    expect(app.currentStageId).toBe(to);
    // initial "Applied" transition + this one
    expect(await prisma.stageTransition.count({ where: { applicationId: appId, toStageId: to } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'MOVE_STAGE', entityId: appId } })).toBe(1);
  });

  it('stage of another job is 400', async () => {
    const other = await mkJob(w.org.id, w.recruiter.id, w.hm.id);
    const r = await login('recruiter@test.local');
    const res = await r.post(`${API}/applications/${appId}/move`).send({ toStageId: stageId(other, 'Screening') });
    expect(res.status).toBe(400);
  });

  it('Offer needs approval: recruiter gets 202, app stays; HM approves; recruiter cannot decide', async () => {
    const offer = stageId(w.job, 'Offer');
    const r = await login('recruiter@test.local');
    const res = await r.post(`${API}/applications/${appId}/move`).send({ toStageId: offer });
    expect(res.status).toBe(202);
    expect(res.body.moved).toBe(false);
    const before = await prisma.application.findUniqueOrThrow({ where: { id: appId } });
    expect(before.currentStageId).toBe(stageId(w.job, 'Applied'));

    const approvalId = res.body.approvalId as string;
    expect((await r.post(`${API}/approvals/${approvalId}/decide`).send({ approve: true })).status).toBe(403);

    const hm = await login('hm@test.local');
    const dec = await hm.post(`${API}/approvals/${approvalId}/decide`).send({ approve: true });
    expect(dec.status).toBe(200);
    const after = await prisma.application.findUniqueOrThrow({ where: { id: appId } });
    expect(after.currentStageId).toBe(offer);
    expect((await prisma.stageApproval.findUniqueOrThrow({ where: { id: approvalId } })).status).toBe('APPROVED');
  });

  it('other hiring manager cannot decide', async () => {
    const r = await login('recruiter@test.local');
    const res = await r.post(`${API}/applications/${appId}/move`).send({ toStageId: stageId(w.job, 'Offer') });
    const hm2 = await login('hm2@test.local');
    expect((await hm2.post(`${API}/approvals/${res.body.approvalId}/decide`).send({ approve: true })).status).toBe(403);
  });

  it('denied approval keeps the application in place', async () => {
    const r = await login('recruiter@test.local');
    const res = await r.post(`${API}/applications/${appId}/move`).send({ toStageId: stageId(w.job, 'Offer') });
    const hm = await login('hm@test.local');
    expect((await hm.post(`${API}/approvals/${res.body.approvalId}/decide`).send({ approve: false })).status).toBe(200);
    const app = await prisma.application.findUniqueOrThrow({ where: { id: appId } });
    expect(app.currentStageId).toBe(stageId(w.job, 'Applied'));
  });

  it('reject sets REJECTED; moving a rejected application is 409', async () => {
    const r = await login('recruiter@test.local');
    const rej = await r.post(`${API}/applications/${appId}/reject`).send({ reason: 'Not a fit' });
    expect(rej.status).toBe(200);
    const app = await prisma.application.findUniqueOrThrow({ where: { id: appId } });
    expect(app.status).toBe('REJECTED');
    const mv = await r.post(`${API}/applications/${appId}/move`).send({ toStageId: stageId(w.job, 'Screening') });
    expect(mv.status).toBe(409);
  });
});

describe('workflow config (PUT /jobs/:id/stages)', () => {
  const full = (job: Awaited<ReturnType<typeof mkJob>>) =>
    job.stages.map((s) => ({
      id: s.id,
      name: s.name,
      category: s.category,
      notifyCandidate: s.notifyCandidate,
      emailTemplateKey: s.emailTemplateKey,
      requiresApproval: s.requiresApproval,
      approverRole: s.approverRole,
    }));

  it('renames, reorders and adds a stage', async () => {
    const r = await login('recruiter@test.local');
    const spare = await mkJob(w.org.id, w.recruiter.id, w.hm.id);
    const stages = full(spare);
    stages[1].name = 'Phone Screen';
    [stages[2], stages[3]] = [stages[3], stages[2]]; // swap Assessment/Interview
    stages.splice(2, 0, { name: 'Take-home' } as never);
    const res = await r.put(`${API}/jobs/${spare.id}/stages`).send(stages);
    expect(res.status).toBe(200);
    const names = res.body.map((s: { name: string }) => s.name);
    expect(names.slice(0, 5)).toEqual(['Applied', 'Phone Screen', 'Take-home', 'Interview', 'Assessment']);
    expect(res.body.map((s: { order: number }) => s.order)).toEqual([...res.body.keys()]);
  });

  it('deleting a stage that holds candidates is 409', async () => {
    const r = await login('recruiter@test.local');
    const job = await prisma.job.findUniqueOrThrow({ where: { id: w.job.id }, include: { stages: { orderBy: { order: 'asc' } } } });
    const without = full(job).filter((s) => s.name !== 'Applied'); // candidate sits in Applied
    // first stage must stay ACTIVE: Screening is ACTIVE so validation passes, conflict fires
    expect((await r.put(`${API}/jobs/${w.job.id}/stages`).send(without)).status).toBe(409);
  });

  it('deleting an empty stage works', async () => {
    const r = await login('recruiter@test.local');
    const job = await prisma.job.findUniqueOrThrow({ where: { id: w.job.id }, include: { stages: { orderBy: { order: 'asc' } } } });
    const res = await r.put(`${API}/jobs/${w.job.id}/stages`).send(full(job).filter((s) => s.name !== 'Assessment'));
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(6);
  });

  it('list without a Rejected stage is 400', async () => {
    const r = await login('recruiter@test.local');
    const spare = await mkJob(w.org.id, w.recruiter.id, w.hm.id);
    const res = await r.put(`${API}/jobs/${spare.id}/stages`).send(full(spare).filter((s) => s.category !== 'REJECTED'));
    expect(res.status).toBe(400);
  });
});
