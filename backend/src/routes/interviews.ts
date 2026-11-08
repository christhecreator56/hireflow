import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { me, requireAuth, requireRole, STAFF } from '../lib/auth.js';
import { audit } from '../lib/audit.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/http.js';
import { canSeeJob, loadApplication, maskPII } from '../lib/access.js';
import { findClashes, notifyCandidate } from '../lib/pipeline.js';

export const router = Router();
router.use(requireAuth, requireRole(...STAFF));

const ivSchema = z.object({
  title: z.string().trim().min(2).max(100).default('Interview'),
  scheduledAt: z.coerce.date().refine((d) => d.getTime() > Date.now(), 'Interview must be in the future'),
  durationMin: z.number().int().min(15).max(480).default(60),
  mode: z.enum(['ONLINE', 'ONSITE']).default('ONLINE'),
  locationOrLink: z.string().trim().max(300).optional(),
  interviewerIds: z.array(z.string()).min(1, 'Assign at least one interviewer'),
});

const fmt = (d: Date) => d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });

async function checkPanel(orgId: string | null, ids: string[], start: Date, duration: number, ignoreId?: string) {
  const users = await prisma.user.findMany({ where: { id: { in: ids }, orgId, isActive: true, role: { not: 'CANDIDATE' } } });
  if (users.length !== new Set(ids).size) throw badRequest('Interviewers must be active staff in your organization');
  const clashes = await findClashes(ids, start, duration, ignoreId);
  if (clashes.length) throw conflict(`Double booking: ${clashes.join(', ')} already has an interview at that time`);
}

export const scheduleRouter = Router();
scheduleRouter.post('/:id/interviews', requireAuth, requireRole(...STAFF), async (req, res) => {
  const app = await loadApplication(me(req), String(req.params.id));
  if (app.status !== 'ACTIVE') throw conflict('Cannot schedule interviews for a closed application');
  const { interviewerIds, ...data } = ivSchema.parse(req.body);
  await checkPanel(me(req).orgId, interviewerIds, data.scheduledAt, data.durationMin);
  const iv = await prisma.interview.create({
    data: { ...data, applicationId: app.id, panel: { create: [...new Set(interviewerIds)].map((userId) => ({ userId })) } },
    include: { panel: true },
  });
  await audit(req, 'SCHEDULE', 'Interview', iv.id, undefined, iv);
  await notifyCandidate(app.id, 'interview_scheduled', {
    interviewTitle: iv.title,
    interviewDate: fmt(iv.scheduledAt),
    durationMin: iv.durationMin,
    location: iv.locationOrLink ?? (iv.mode === 'ONLINE' ? 'Link to follow' : 'Office'),
  });
  res.status(201).json(iv);
});

/** Interviewer's own queue; contact details masked (role-limited access). */
router.get('/mine', async (req, res) => {
  const ivs = await prisma.interview.findMany({
    where: { panel: { some: { userId: me(req).id } }, status: { not: 'CANCELLED' } },
    orderBy: { scheduledAt: 'asc' },
    include: {
      scorecards: { where: { interviewerId: me(req).id } },
      application: {
        select: {
          id: true,
          resumeId: true,
          job: { select: { id: true, title: true, criteria: { orderBy: { order: 'asc' } } } },
          candidate: { select: { phone: true, skills: true, experienceYears: true, user: { select: { name: true, email: true } } } },
        },
      },
    },
  });
  res.json(
    ivs.map((iv) => {
      const c = iv.application.candidate;
      const masked = maskPII({ email: c.user.email, phone: c.phone });
      return { ...iv, application: { ...iv.application, candidate: { name: c.user.name, skills: c.skills, experienceYears: c.experienceYears, ...masked } } };
    }),
  );
});

async function loadInterview(userId: string, orgUser: Parameters<typeof canSeeJob>[0], id: string) {
  const iv = await prisma.interview.findUnique({ where: { id }, include: { panel: true, application: { include: { job: true } } } });
  if (!iv) throw notFound('Interview');
  const onPanel = iv.panel.some((p) => p.userId === userId);
  if (!onPanel && !canSeeJob(orgUser, iv.application.job)) throw forbidden();
  return { iv, onPanel };
}

router.patch('/:id', async (req, res) => {
  const { iv } = await loadInterview(me(req).id, me(req), String(req.params.id));
  if (!canSeeJob(me(req), iv.application.job)) throw forbidden();
  const body = ivSchema.partial().extend({ status: z.enum(['SCHEDULED', 'COMPLETED', 'CANCELLED']).optional() }).parse(req.body);
  if (iv.status !== 'SCHEDULED') throw conflict(`Interview is ${iv.status.toLowerCase()} and can no longer be changed`);
  const { interviewerIds, ...data } = body;
  const start = data.scheduledAt ?? iv.scheduledAt;
  const duration = data.durationMin ?? iv.durationMin;
  const panelIds = interviewerIds ?? iv.panel.map((p) => p.userId);
  if ((data.status ?? iv.status) === 'SCHEDULED' && (data.scheduledAt || data.durationMin || interviewerIds)) {
    await checkPanel(me(req).orgId, panelIds, start, duration, iv.id);
  }
  const updated = await prisma.$transaction(async (tx) => {
    if (interviewerIds) {
      await tx.interviewPanel.deleteMany({ where: { interviewId: iv.id } });
      await tx.interviewPanel.createMany({ data: [...new Set(interviewerIds)].map((userId) => ({ interviewId: iv.id, userId })) });
    }
    return tx.interview.update({ where: { id: iv.id }, data, include: { panel: true } });
  });
  await audit(req, 'UPDATE', 'Interview', iv.id, iv, updated);
  if (data.scheduledAt && updated.status === 'SCHEDULED') {
    await notifyCandidate(iv.applicationId, 'interview_scheduled', {
      interviewTitle: `${updated.title} (rescheduled)`,
      interviewDate: fmt(updated.scheduledAt),
      durationMin: updated.durationMin,
      location: updated.locationOrLink ?? 'Link to follow',
    });
  }
  res.json(updated);
});

// Structured evaluation: ratings must cover exactly the job's criteria.
router.post('/:id/scorecards', async (req, res) => {
  const { iv, onPanel } = await loadInterview(me(req).id, me(req), String(req.params.id));
  if (!onPanel) throw forbidden('Only assigned interviewers can submit a scorecard');
  if (iv.status !== 'SCHEDULED') throw conflict(`Interview is ${iv.status.toLowerCase()}; scorecards are closed`);
  const body = z
    .object({
      ratings: z.record(z.string(), z.number().int().min(1).max(5)),
      comments: z.string().trim().max(3000).optional(),
      recommendation: z.enum(['STRONG_YES', 'YES', 'NO', 'STRONG_NO']),
    })
    .parse(req.body);
  const criteria = await prisma.scorecardCriterion.findMany({ where: { jobId: iv.application.jobId } });
  const missing = criteria.filter((c) => body.ratings[c.name] === undefined).map((c) => c.name);
  if (missing.length) throw badRequest('Rate every criterion', { missing });
  const extra = Object.keys(body.ratings).filter((k) => !criteria.some((c) => c.name === k));
  if (extra.length) throw badRequest('Unknown criteria', { extra });

  const sc = await prisma.scorecard.upsert({
    where: { interviewId_interviewerId: { interviewId: iv.id, interviewerId: me(req).id } },
    create: { ...body, interviewId: iv.id, interviewerId: me(req).id },
    update: { ...body, submittedAt: new Date() },
  });
  await audit(req, 'SUBMIT_SCORECARD', 'Scorecard', sc.id, undefined, sc);
  res.status(201).json(sc);
});
