import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { me, requireAuth, requireRole, STAFF } from '../lib/auth.js';
import { audit } from '../lib/audit.js';
import { conflict, forbidden, notFound } from '../lib/http.js';
import { canSeeJob, loadApplication } from '../lib/access.js';
import { forbidUnlessApprover, moveApplication, notifyCandidate, rejectApplication } from '../lib/pipeline.js';
import { requireStorage, signedUrl } from '../lib/storage.js';

export const router = Router();
router.use(requireAuth, requireRole(...STAFF));

router.get('/:id', async (req, res) => {
  await loadApplication(me(req), String(req.params.id));
  const app = await prisma.application.findUniqueOrThrow({
    where: { id: String(req.params.id) },
    include: {
      job: { select: { id: true, title: true, hiringManagerId: true, stages: { orderBy: { order: 'asc' } }, criteria: { orderBy: { order: 'asc' } } } },
      currentStage: true,
      resume: true,
      candidate: { include: { user: { select: { id: true, name: true, email: true } } } },
      answers: { include: { question: { select: { label: true, type: true, order: true } } } },
      transitions: {
        orderBy: { createdAt: 'asc' },
        include: { fromStage: { select: { name: true } }, toStage: { select: { name: true } }, movedBy: { select: { name: true, role: true } } },
      },
      approvals: { orderBy: { createdAt: 'desc' }, include: { targetStage: { select: { name: true, approverRole: true } } } },
      interviews: {
        orderBy: { scheduledAt: 'asc' },
        include: {
          panel: { include: { user: { select: { id: true, name: true, role: true } } } },
          scorecards: { include: { interviewer: { select: { id: true, name: true } } } },
        },
      },
      notes: { orderBy: { createdAt: 'desc' } },
    },
  });
  const emails = await prisma.emailLog.findMany({ where: { applicationId: app.id }, orderBy: { createdAt: 'desc' } });
  const authors = await prisma.user.findMany({ where: { id: { in: app.notes.map((n) => n.authorId) } }, select: { id: true, name: true } });
  const notes = app.notes.map((n) => ({ ...n, author: authors.find((a) => a.id === n.authorId)?.name ?? 'Unknown' }));
  res.json({ ...app, notes, emails });
});

router.post('/:id/move', async (req, res) => {
  const { toStageId, note } = z.object({ toStageId: z.string(), note: z.string().max(500).optional() }).parse(req.body);
  await loadApplication(me(req), String(req.params.id));
  const result = await moveApplication({ applicationId: String(req.params.id), toStageId, actor: me(req), note });
  await audit(req, result.moved ? 'MOVE_STAGE' : 'APPROVAL_REQUESTED', 'Application', String(req.params.id), undefined, { toStageId, note });
  res.status(result.moved ? 200 : 202).json(result);
});

router.post('/:id/reject', async (req, res) => {
  const { reason } = z.object({ reason: z.string().trim().min(3).max(500) }).parse(req.body);
  await loadApplication(me(req), String(req.params.id));
  const result = await rejectApplication(String(req.params.id), me(req), reason);
  await audit(req, 'REJECT', 'Application', String(req.params.id), undefined, { reason });
  res.json(result);
});

router.post('/:id/notes', async (req, res) => {
  const { body } = z.object({ body: z.string().trim().min(1).max(2000) }).parse(req.body);
  await loadApplication(me(req), String(req.params.id));
  const note = await prisma.note.create({ data: { applicationId: String(req.params.id), authorId: me(req).id, body } });
  await audit(req, 'CREATE', 'Note', note.id);
  res.status(201).json(note);
});

router.post('/:id/email', requireRole('EMPLOYER', 'RECRUITER'), async (req, res) => {
  const { templateKey } = z.object({ templateKey: z.string() }).parse(req.body);
  await loadApplication(me(req), String(req.params.id));
  const log = await notifyCandidate(String(req.params.id), templateKey);
  if (!log) throw notFound('Email template');
  await audit(req, 'SEND_EMAIL', 'Application', String(req.params.id), undefined, { templateKey });
  res.status(202).json(log);
});

/** Staff resume access: requires access to an application that uses this resume; every view audited. */
router.get('/resumes/:resumeId/url', async (req, res) => {
  const resume = await prisma.resume.findUnique({
    where: { id: String(req.params.resumeId) },
    include: { applications: { include: { job: true } } },
  });
  if (!resume) throw notFound('Resume');
  if (!resume.applications.some((a) => canSeeJob(me(req), a.job))) throw forbidden();
  await audit(req, 'VIEW_RESUME', 'Resume', resume.id);
  requireStorage();
  res.json({ url: await signedUrl(resume.fileKey, resume.fileName) });
});

// ---------- Approvals (USP G) ----------
export const approvalsRouter = Router();
approvalsRouter.use(requireAuth, requireRole(...STAFF));

approvalsRouter.get('/', async (req, res) => {
  const user = me(req);
  const status = z.enum(['PENDING', 'APPROVED', 'REJECTED']).default('PENDING').parse(req.query.status);
  const approvals = await prisma.stageApproval.findMany({
    where: {
      status,
      application: { job: { orgId: user.orgId!, ...(user.role === 'HIRING_MANAGER' && { hiringManagerId: user.id }) } },
      ...(user.role !== 'EMPLOYER' && { targetStage: { approverRole: user.role } }),
    },
    orderBy: { createdAt: 'desc' },
    include: {
      targetStage: { select: { name: true, approverRole: true } },
      application: {
        select: {
          id: true,
          job: { select: { id: true, title: true } },
          currentStage: { select: { name: true } },
          candidate: { select: { user: { select: { name: true } } } },
        },
      },
    },
  });
  res.json(approvals);
});

approvalsRouter.post('/:id/decide', async (req, res) => {
  const { approve, comment } = z.object({ approve: z.boolean(), comment: z.string().max(500).optional() }).parse(req.body);
  const approval = await prisma.stageApproval.findUnique({
    where: { id: String(req.params.id) },
    include: { targetStage: true, application: { include: { job: true } } },
  });
  if (!approval || approval.application.job.orgId !== me(req).orgId) throw notFound('Approval');
  if (approval.status !== 'PENDING') throw conflict('This approval was already decided');
  forbidUnlessApprover(me(req), approval.targetStage, approval.application.job);

  await prisma.stageApproval.update({
    where: { id: approval.id },
    data: { status: approve ? 'APPROVED' : 'REJECTED', approverId: me(req).id, comment, decidedAt: new Date() },
  });
  const result = approve
    ? await moveApplication({
        applicationId: approval.applicationId,
        toStageId: approval.targetStageId,
        actor: me(req),
        note: comment ?? 'Approved',
        approved: true,
      })
    : null;
  await audit(req, approve ? 'APPROVE' : 'DENY', 'StageApproval', approval.id, undefined, { comment });
  res.json({ approved: approve, result });
});
