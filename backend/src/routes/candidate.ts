import { Router } from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { me, requireAuth, requireRole } from '../lib/auth.js';
import { audit } from '../lib/audit.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/http.js';
import { putObject, signedUrl } from '../lib/storage.js';
import { notifyCandidate } from '../lib/pipeline.js';
import { exportCandidateData } from '../lib/governance.js';
import { POLICY_VERSION } from './auth.js';

export const router = Router();
router.use(requireAuth, requireRole('CANDIDATE'));

const RESUME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) =>
    RESUME_TYPES.includes(file.mimetype) ? cb(null, true) : cb(badRequest('Resume must be a PDF or DOCX file')),
});

const profileOf = async (userId: string) => {
  const p = await prisma.candidateProfile.findUnique({ where: { userId } });
  if (!p) throw notFound('Profile');
  return p;
};

// Candidate-facing labels: internal stage names stay internal.
const publicStatus = (status: string, stage: string) =>
  status === 'HIRED' ? 'Hired' : status === 'REJECTED' ? 'Not selected' : status === 'WITHDRAWN' ? 'Withdrawn' : stage;

// ---------- Profile ----------
router.get('/profile', async (req, res) => {
  const profile = await prisma.candidateProfile.findUnique({
    where: { userId: me(req).id },
    include: { user: { select: { name: true, email: true } }, resumes: { orderBy: { uploadedAt: 'desc' } } },
  });
  res.json(profile);
});

// Only these fields are candidate-editable (strict() rejects anything else, e.g. email/role).
const profileSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    phone: z.string().trim().regex(/^[+\d\s()-]{7,20}$/, 'Invalid phone number').nullable(),
    location: z.string().trim().max(100).nullable(),
    linkedin: z.string().trim().url().nullable(),
    headline: z.string().trim().max(150).nullable(),
    skills: z.array(z.string().trim().min(1).max(40)).max(30),
    experienceYears: z.number().int().min(0).max(60).nullable(),
  })
  .partial()
  .strict();

router.patch('/profile', async (req, res) => {
  const { name, ...fields } = profileSchema.parse(req.body);
  const before = await profileOf(me(req).id);
  const profile = await prisma.candidateProfile.update({ where: { id: before.id }, data: fields });
  if (name) await prisma.user.update({ where: { id: me(req).id }, data: { name } });
  await audit(req, 'UPDATE', 'CandidateProfile', profile.id, before, { ...profile, name });
  res.json(profile);
});

// ---------- Resumes ----------
router.post('/resumes', upload.single('file'), async (req, res) => {
  if (!req.file) throw badRequest('Attach a file in the "file" field');
  const profile = await profileOf(me(req).id);
  const key = `resumes/${profile.id}/${randomUUID()}`;
  await putObject(key, req.file.buffer, req.file.mimetype);
  const resume = await prisma.resume.create({
    data: { candidateId: profile.id, fileKey: key, fileName: req.file.originalname, mimeType: req.file.mimetype, size: req.file.size },
  });
  await audit(req, 'UPLOAD', 'Resume', resume.id);
  res.status(201).json(resume);
});

router.get('/resumes', async (req, res) => {
  const profile = await profileOf(me(req).id);
  res.json(await prisma.resume.findMany({ where: { candidateId: profile.id }, orderBy: { uploadedAt: 'desc' } }));
});

// ---------- Applications ----------
const applySchema = z.object({
  resumeId: z.string().optional(),
  source: z.enum(['LINKEDIN', 'REFERRAL', 'JOB_BOARD', 'WEBSITE', 'OTHER']).default('WEBSITE'),
  answers: z.record(z.string(), z.union([z.string(), z.array(z.string()), z.boolean()])).default({}),
});

export const applyRouter = Router();
applyRouter.post('/:id/apply', requireAuth, requireRole('CANDIDATE'), async (req, res) => {
  const body = applySchema.parse(req.body);
  const profile = await profileOf(me(req).id);
  const job = await prisma.job.findUnique({
    where: { id: String(req.params.id) },
    include: { questions: true, stages: { orderBy: { order: 'asc' }, take: 1 } },
  });
  if (!job) throw notFound('Job');
  if (job.status !== 'PUBLISHED') throw badRequest(`This job is ${job.status.toLowerCase()} and not accepting applications`);
  if (body.resumeId && !(await prisma.resume.findFirst({ where: { id: body.resumeId, candidateId: profile.id } }))) {
    throw badRequest('Resume not found');
  }

  const missing = job.questions.filter((q) => {
    const v = body.answers[q.id];
    return q.required && (v === undefined || v === '' || (Array.isArray(v) && v.length === 0));
  });
  if (missing.length) throw badRequest('Please answer all required questions', { missing: missing.map((q) => q.label) });
  const unknown = Object.keys(body.answers).filter((id) => !job.questions.some((q) => q.id === id));
  if (unknown.length) throw badRequest('Answers reference unknown questions');

  const existing = await prisma.application.findUnique({ where: { jobId_candidateId: { jobId: job.id, candidateId: profile.id } } });
  if (existing) throw conflict('You have already applied to this job');

  const first = job.stages[0];
  const app = await prisma.application.create({
    data: {
      jobId: job.id,
      candidateId: profile.id,
      currentStageId: first.id,
      resumeId: body.resumeId,
      source: body.source,
      answers: { create: Object.entries(body.answers).map(([questionId, value]) => ({ questionId, value })) },
      transitions: { create: { toStageId: first.id, movedById: me(req).id, note: 'Applied' } },
    },
  });
  await prisma.consent.create({
    data: { userId: me(req).id, type: `APPLICATION:${job.id}`, policyVersion: POLICY_VERSION, granted: true, ip: req.ip },
  });
  await audit(req, 'APPLY', 'Application', app.id, undefined, { jobId: job.id, source: body.source });
  await notifyCandidate(app.id, 'application_received');
  res.status(201).json(app);
});

router.get('/applications', async (req, res) => {
  const profile = await profileOf(me(req).id);
  const apps = await prisma.application.findMany({
    where: { candidateId: profile.id },
    orderBy: { appliedAt: 'desc' },
    include: {
      job: { select: { id: true, title: true, location: true, org: { select: { name: true } } } },
      currentStage: { select: { name: true } },
      transitions: { orderBy: { createdAt: 'asc' }, select: { createdAt: true, toStage: { select: { name: true, category: true } } } },
      interviews: {
        where: { status: { not: 'CANCELLED' } },
        select: { id: true, title: true, scheduledAt: true, durationMin: true, mode: true, locationOrLink: true, status: true },
      },
    },
  });
  res.json(
    apps.map(({ currentStage, transitions, rejectionReason: _r, ...a }) => ({
      ...a,
      statusLabel: publicStatus(a.status, currentStage.name),
      timeline: transitions.map((t) => ({
        at: t.createdAt,
        label: t.toStage.category === 'REJECTED' ? 'Not selected' : t.toStage.name,
      })),
    })),
  );
});

router.post('/applications/:id/withdraw', async (req, res) => {
  const profile = await profileOf(me(req).id);
  const app = await prisma.application.findUnique({ where: { id: String(req.params.id) } });
  if (!app) throw notFound('Application');
  if (app.candidateId !== profile.id) throw forbidden();
  if (app.status !== 'ACTIVE') throw conflict('Only active applications can be withdrawn');
  const updated = await prisma.application.update({ where: { id: app.id }, data: { status: 'WITHDRAWN' } });
  await audit(req, 'WITHDRAW', 'Application', app.id, { status: app.status }, { status: 'WITHDRAWN' });
  res.json(updated);
});

// ---------- Notifications ----------
router.get('/notifications', async (req, res) => {
  res.json(await prisma.notification.findMany({ where: { userId: me(req).id }, orderBy: { createdAt: 'desc' }, take: 50 }));
});
router.post('/notifications/read', async (req, res) => {
  await prisma.notification.updateMany({ where: { userId: me(req).id, read: false }, data: { read: true } });
  res.status(204).end();
});

// ---------- USP H: consent, export, deletion ----------
router.get('/consents', async (req, res) => {
  res.json(await prisma.consent.findMany({ where: { userId: me(req).id }, orderBy: { createdAt: 'desc' } }));
});

router.post('/consents', async (req, res) => {
  const { type, granted } = z.object({ type: z.enum(['TALENT_POOL', 'MARKETING']), granted: z.boolean() }).parse(req.body);
  if (!granted) {
    await prisma.consent.updateMany({ where: { userId: me(req).id, type, withdrawnAt: null }, data: { withdrawnAt: new Date() } });
  } else {
    await prisma.consent.create({ data: { userId: me(req).id, type, policyVersion: POLICY_VERSION, granted, ip: req.ip } });
  }
  await audit(req, granted ? 'CONSENT_GRANT' : 'CONSENT_WITHDRAW', 'Consent', me(req).id, undefined, { type });
  res.json(await prisma.consent.findMany({ where: { userId: me(req).id }, orderBy: { createdAt: 'desc' } }));
});

router.get('/export', async (req, res) => {
  const data = await exportCandidateData(me(req).id);
  await audit(req, 'DATA_EXPORT', 'User', me(req).id);
  res.setHeader('Content-Disposition', 'attachment; filename="my-data.json"');
  res.json(data);
});

router.get('/data-requests', async (req, res) => {
  res.json(await prisma.dataRequest.findMany({ where: { userId: me(req).id }, orderBy: { createdAt: 'desc' } }));
});

router.post('/data-requests', async (req, res) => {
  const { reason } = z.object({ reason: z.string().max(500).optional() }).parse(req.body);
  const pending = await prisma.dataRequest.findFirst({ where: { userId: me(req).id, type: 'DELETE', status: 'PENDING' } });
  if (pending) throw conflict('You already have a pending deletion request');
  const dr = await prisma.dataRequest.create({ data: { userId: me(req).id, type: 'DELETE', reason } });
  await audit(req, 'DELETION_REQUESTED', 'DataRequest', dr.id);
  res.status(201).json(dr);
});

// Candidates may open only their own resumes.
router.get('/resumes/:id/url', async (req, res) => {
  const profile = await profileOf(me(req).id);
  const r = await prisma.resume.findFirst({ where: { id: String(req.params.id), candidateId: profile.id } });
  if (!r) throw notFound('Resume');
  res.json({ url: await signedUrl(r.fileKey, r.fileName) });
});
