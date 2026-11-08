import { beforeEach, describe, expect, it } from 'vitest';
import { API, applyAs, login, mkUser, prisma, seedWorld } from './helpers.js';

let w: Awaited<ReturnType<typeof seedWorld>>;
let appId: string;
const start = () => new Date(Date.now() + 3 * 24 * 3600_000).toISOString();
beforeEach(async () => {
  w = await seedWorld();
  appId = (await applyAs(await login('cand@test.local'), w.job.id)).body.id;
});

async function schedule(at: string, interviewerIds: string[], durationMin = 60, onApp = appId) {
  const r = await login('recruiter@test.local');
  return r.post(`${API}/applications/${onApp}/interviews`).send({ title: 'Tech round', scheduledAt: at, durationMin, interviewerIds });
}

const ratings = { 'Technical skills': 4, 'Problem solving': 5, Communication: 3, 'Culture fit': 4 };

describe('interviews', () => {
  it('schedules an interview', async () => {
    const res = await schedule(start(), [w.hm.id]);
    expect(res.status).toBe(201);
    expect(res.body.panel).toHaveLength(1);
  });

  it('past date is 400', async () => {
    expect((await schedule(new Date(Date.now() - 3600_000).toISOString(), [w.hm.id])).status).toBe(400);
  });

  it('double-booking an interviewer at overlapping time is 409', async () => {
    const t = new Date(Date.now() + 3 * 24 * 3600_000);
    expect((await schedule(t.toISOString(), [w.hm.id], 60)).status).toBe(201);
    const c2 = await mkUser('CANDIDATE', null, 'cand3@test.local');
    const a2 = await login('cand2@test.local');
    const app2 = (await applyAs(a2, w.job.id)).body.id;
    const overlap = new Date(t.getTime() + 30 * 60_000).toISOString();
    expect((await schedule(overlap, [w.hm.id], 60, app2)).status).toBe(409);
    // different interviewer is fine, as is back-to-back
    expect((await schedule(overlap, [w.hm2.id], 60, app2)).status).toBe(201);
    expect(c2.id).toBeTruthy();
    const after = new Date(t.getTime() + 60 * 60_000).toISOString();
    expect((await schedule(after, [w.hm.id], 60, app2)).status).toBe(201);
  });

  describe('scorecards', () => {
    let ivId: string;
    beforeEach(async () => {
      ivId = (await schedule(start(), [w.hm.id])).body.id;
    });

    it('non-panel user gets 403', async () => {
      const r = await login('recruiter@test.local');
      const res = await r.post(`${API}/interviews/${ivId}/scorecards`).send({ ratings, recommendation: 'YES' });
      expect(res.status).toBe(403);
    });

    it('missing criterion is 400', async () => {
      const hm = await login('hm@test.local');
      const { Communication: _c, ...partial } = ratings;
      const res = await hm.post(`${API}/interviews/${ivId}/scorecards`).send({ ratings: partial, recommendation: 'YES' });
      expect(res.status).toBe(400);
      expect(res.body.details.missing).toEqual(['Communication']);
    });

    it('valid scorecard is 201 and persisted', async () => {
      const hm = await login('hm@test.local');
      const res = await hm.post(`${API}/interviews/${ivId}/scorecards`).send({ ratings, comments: 'Strong', recommendation: 'STRONG_YES' });
      expect(res.status).toBe(201);
      expect(await prisma.scorecard.count({ where: { interviewId: ivId, interviewerId: w.hm.id } })).toBe(1);
    });

    it('interviewer queue masks contact details', async () => {
      const hm = await login('hm@test.local');
      const res = await hm.get(`${API}/interviews/mine`);
      expect(res.status).toBe(200);
      const cand = res.body[0].application.candidate;
      expect(cand.email).toBe('c***@test.local');
      expect(cand.phone).not.toContain('98765');
    });
  });
});
