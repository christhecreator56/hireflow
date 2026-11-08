/**
 * Demo data from real resumes: every resume becomes a candidate, applies to the
 * published job that fits them best, and is moved through that job's pipeline
 * according to skill match (strongest → hired / offer, weakest → rejected).
 */
import type { JobStage, PrismaClient, User } from '@prisma/client';
import { DEFAULT_CRITERIA } from '../src/lib/pipeline.js';
import { createCandidateFromResume, resumeFiles, skillOverlap } from './import-resumes.js';

type JobWithStages = { id: string; title: string; orgId: string; skills: string[]; hiringManagerId: string | null; stages: JobStage[]; questions: { id: string }[] };
type Outcome = 'HIRED' | 'OFFER_PENDING' | 'INTERVIEW' | 'ASSESSMENT' | 'SCREENING' | 'APPLIED' | 'REJECTED';

const DAY = 86_400_000;
const ago = (d: number) => new Date(Date.now() - d * DAY);

/** Strongest applicant per job is hired, next waits on offer approval, then interviews, and so on. */
export function outcomeFor(rank: number, match: number, hasText: boolean, total = 0): Outcome {
  if (!hasText) return 'APPLIED'; // scanned resume: needs a human read first
  if (total >= 6 && rank === total - 1) return 'REJECTED'; // crowded role: weakest fit is let go after assessment
  if (rank === 0 && match >= 0.75) return 'HIRED';
  if (rank === 1 && match >= 0.5) return 'OFFER_PENDING';
  if (rank <= 3 && match >= 0.5) return 'INTERVIEW';
  if (match >= 0.5) return 'ASSESSMENT';
  if (match >= 0.25) return 'SCREENING';
  return rank % 2 ? 'REJECTED' : 'APPLIED';
}

export async function seedFromResumes(
  prisma: PrismaClient,
  ctx: { dir: string; jobs: JobWithStages[]; recruiters: User[]; employer: User; passwordHash: string },
) {
  const files = resumeFiles(ctx.dir);
  // The repo owner's own resume doubles as the demo candidate login (candidate@acme.test).
  const demoFile = files.find((f) => /christopher/i.test(f)) ?? files[0];
  const people = [];
  for (const file of files) {
    const c = await createCandidateFromResume(prisma, ctx.dir, file, ctx.passwordHash, file === demoFile ? 'candidate@acme.test' : undefined);
    if (c) people.push(c);
  }

  // Each candidate applies to their best-fitting job; ties go to the job with fewer applicants so far.
  const load = new Map(ctx.jobs.map((j) => [j.id, 0]));
  const byJob = new Map<string, { c: (typeof people)[number]; m: number }[]>();
  for (const c of people) {
    const best = ctx.jobs
      .map((j) => ({ j, m: skillOverlap(c.parsed.skills, j.skills) }))
      .sort((a, b) => b.m - a.m || load.get(a.j.id)! - load.get(b.j.id)!)[0];
    load.set(best.j.id, load.get(best.j.id)! + 1);
    byJob.set(best.j.id, [...(byJob.get(best.j.id) ?? []), { c, m: best.m }]);
  }

  const summary: string[] = [];
  let slot = 0; // spreads upcoming interviews so no interviewer is double-booked
  let k = 0;
  for (const job of ctx.jobs) {
    const applicants = (byJob.get(job.id) ?? []).sort((a, b) => b.m - a.m);
    const active = job.stages.filter((s) => s.category === 'ACTIVE');
    const hired = job.stages.find((s) => s.category === 'HIRED')!;
    const rejected = job.stages.find((s) => s.category === 'REJECTED')!;
    const interviewIdx = Math.max(1, active.findIndex((s) => /interview/i.test(s.name)));
    const offer = active.find((s) => s.requiresApproval);

    for (const [rank, { c, m }] of applicants.entries()) {
      k++;
      const outcome = outcomeFor(rank, m, !!c.parsed.text, applicants.length);
      const reach: Record<Outcome, number> = {
        HIRED: active.length - 1,
        OFFER_PENDING: interviewIdx,
        INTERVIEW: interviewIdx,
        ASSESSMENT: Math.min(2, interviewIdx - 1 || 1),
        SCREENING: 1,
        APPLIED: 0,
        REJECTED: Math.min(2, interviewIdx - 1 || 1),
      };
      const path = active.slice(0, reach[outcome] + 1);
      if (outcome === 'HIRED') path.push(hired);
      if (outcome === 'REJECTED') path.push(rejected);

      const appliedAt = outcome === 'APPLIED' ? ago(1 + (k % 5)) : ago(30 - (k % 12));
      const step = (Date.now() - DAY - appliedAt.getTime()) / (path.length + 1);
      const final = path[path.length - 1];
      const recruiter = ctx.recruiters[k % ctx.recruiters.length];
      const app = await prisma.application.create({
        data: {
          jobId: job.id,
          candidateId: c.profile.id,
          currentStageId: final.id,
          resumeId: c.resume.id,
          source: ['LINKEDIN', 'REFERRAL', 'JOB_BOARD', 'WEBSITE'][k % 4],
          appliedAt,
          status: outcome === 'HIRED' ? 'HIRED' : outcome === 'REJECTED' ? 'REJECTED' : 'ACTIVE',
          rejectionReason: outcome === 'REJECTED' ? 'Not progressed after assessment: stronger matches shortlisted' : null,
          answers: {
            create: [
              { questionId: job.questions[0].id, value: `I want to grow as a ${c.profile.headline ?? 'developer'} and build real products with the Acme team.` },
              { questionId: job.questions[1].id, value: 'Immediate' },
              { questionId: job.questions[2].id, value: true },
            ],
          },
        },
      });
      let prev: string | null = null;
      for (const [i, s] of path.entries()) {
        await prisma.stageTransition.create({
          data: {
            applicationId: app.id,
            fromStageId: prev,
            toStageId: s.id,
            movedById: i === 0 ? c.user.id : recruiter.id,
            createdAt: i === 0 ? appliedAt : new Date(appliedAt.getTime() + step * i),
            note: i === 0 ? 'Applied' : s.category === 'REJECTED' ? 'Not progressed after assessment' : undefined,
          },
        });
        prev = s.id;
      }
      await prisma.emailLog.create({
        data: { orgId: job.orgId, toEmail: c.user.email, templateKey: 'application_received', subject: `We received your application for ${job.title}`, status: 'SENT', applicationId: app.id, createdAt: appliedAt },
      });

      const panel = [job.hiringManagerId!, recruiter.id];
      if (outcome === 'HIRED' || outcome === 'OFFER_PENDING') {
        const when = new Date(appliedAt.getTime() + step * (interviewIdx + 0.5));
        const iv = await prisma.interview.create({
          data: {
            applicationId: app.id, title: 'Technical Interview', scheduledAt: when, durationMin: 60, mode: 'ONLINE',
            locationOrLink: 'https://meet.example.com/acme-tech', status: 'COMPLETED',
            panel: { create: panel.map((userId) => ({ userId })) },
          },
        });
        const base = 3 + Math.round(m * 2);
        for (const interviewerId of panel) {
          await prisma.scorecard.create({
            data: {
              interviewId: iv.id, interviewerId,
              ratings: Object.fromEntries(DEFAULT_CRITERIA.map((name, i) => [name, Math.min(5, base - (i % 2))])),
              comments: `Strong in ${c.parsed.skills.slice(0, 3).join(', ')}. Clear communicator.`,
              recommendation: m >= 0.75 ? 'STRONG_YES' : 'YES',
              submittedAt: new Date(when.getTime() + 2 * 3_600_000),
            },
          });
        }
      }
      if (outcome === 'INTERVIEW') {
        slot++;
        const when = new Date(Date.now() + (1 + (slot % 5)) * DAY);
        when.setHours(10 + (slot % 6), 0, 0, 0);
        await prisma.interview.create({
          data: {
            applicationId: app.id, title: 'Technical Interview', scheduledAt: when, durationMin: 60, mode: slot % 2 ? 'ONLINE' : 'ONSITE',
            locationOrLink: slot % 2 ? 'https://meet.example.com/acme-tech' : 'Acme HQ, Chennai · Room 4B',
            panel: { create: panel.map((userId) => ({ userId })) },
          },
        });
      }
      if (outcome === 'OFFER_PENDING' && offer) {
        await prisma.stageApproval.create({
          data: { applicationId: app.id, targetStageId: offer.id, requestedById: recruiter.id, comment: `Interview panel recommends an offer (${Math.round(m * 100)}% skill match)` },
        });
      }
      if (outcome === 'HIRED' && offer) {
        await prisma.stageApproval.create({
          data: {
            applicationId: app.id, targetStageId: offer.id, requestedById: recruiter.id, status: 'APPROVED',
            approverId: offer.approverRole === 'EMPLOYER' ? ctx.employer.id : job.hiringManagerId, comment: 'Approved', decidedAt: new Date(Date.now() - 3 * DAY),
          },
        });
      }
      summary.push(`${outcome.padEnd(13)} ${String(Math.round(m * 100)).padStart(3)}%  ${c.user.name.padEnd(22)} → ${job.title}`);
    }
  }
  console.log(summary.join('\n'));

  // Governance demo: one rejected candidate has asked for their data to be deleted.
  const leaver = await prisma.application.findFirst({ where: { status: 'REJECTED' }, include: { candidate: true } });
  if (leaver) {
    await prisma.dataRequest.create({ data: { userId: leaver.candidate.userId, type: 'DELETE', reason: 'I have accepted another offer, please delete my data.' } });
  }
  return { candidates: people.length, demoCandidate: demoFile };
}
