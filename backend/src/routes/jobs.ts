import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { me, requireAuth, requireRole, STAFF } from '../lib/auth.js';
import { audit } from '../lib/audit.js';
import { badRequest, conflict, notFound } from '../lib/http.js';
import { canTransitionJob, loadJob } from '../lib/access.js';
import { DEFAULT_CRITERIA, DEFAULT_STAGES, replaceStages, stageData, validateStages } from '../lib/pipeline.js';

export const publicRouter = Router();
export const router = Router();

const stageSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(50),
  category: z.enum(['ACTIVE', 'HIRED', 'REJECTED']).default('ACTIVE'),
  notifyCandidate: z.boolean().default(false),
  emailTemplateKey: z.string().nullish(),
  requiresApproval: z.boolean().default(false),
  approverRole: z.enum(['EMPLOYER', 'RECRUITER', 'HIRING_MANAGER']).nullish(),
});

const questionSchema = z
  .object({
    label: z.string().trim().min(1).max(300),
    type: z.enum(['TEXT', 'LONG_TEXT', 'SINGLE_CHOICE', 'MULTI_CHOICE', 'YES_NO']),
    options: z.array(z.string().trim().min(1)).default([]),
    required: z.boolean().default(false),
  })
  .refine((q) => !q.type.endsWith('CHOICE') || q.options.length >= 2, 'Choice questions need at least 2 options');

const jobFields = z.object({
  title: z.string().trim().min(3).max(120),
  department: z.string().trim().max(80).nullish(),
  location: z.string().trim().max(80).nullish(),
  employmentType: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP']).default('FULL_TIME'),
  salaryMin: z.number().int().nonnegative().nullish(),
  salaryMax: z.number().int().nonnegative().nullish(),
  description: z.string().trim().min(10),
  requirements: z.string().trim().nullish(),
  skills: z.array(z.string().trim().min(1)).default([]),
  hiringManagerId: z.string().nullish(),
});

const salaryOk = (j: { salaryMin?: number | null; salaryMax?: number | null }) =>
  j.salaryMin == null || j.salaryMax == null || j.salaryMin <= j.salaryMax;

async function checkHiringManager(orgId: string | null, id?: string | null) {
  if (!id) return;
  const hm = await prisma.user.findFirst({ where: { id, orgId, role: { in: ['HIRING_MANAGER', 'EMPLOYER'] }, isActive: true } });
  if (!hm) throw badRequest('Hiring manager must be an active hiring manager in your organization');
}

// ---------- Public job board ----------
publicRouter.get('/jobs', async (req, res) => {
  const q = z
    .object({ q: z.string().optional(), location: z.string().optional(), type: z.string().optional(), skill: z.string().optional() })
    .parse(req.query);
  const where: Prisma.JobWhereInput = {
    status: 'PUBLISHED',
    ...(q.q && { OR: [{ title: { contains: q.q, mode: 'insensitive' } }, { description: { contains: q.q, mode: 'insensitive' } }] }),
    ...(q.location && { location: { contains: q.location, mode: 'insensitive' } }),
    ...(q.type && { employmentType: q.type }),
    ...(q.skill && { skills: { has: q.skill } }),
  };
  const jobs = await prisma.job.findMany({
    where,
    orderBy: { publishedAt: 'desc' },
    take: 100,
    select: {
      id: true, title: true, department: true, location: true, employmentType: true,
      salaryMin: true, salaryMax: true, skills: true, publishedAt: true, org: { select: { name: true } },
    },
  });
  res.json(jobs);
});

publicRouter.get('/jobs/:id', async (req, res) => {
  const job = await prisma.job.findFirst({
    where: { id: String(req.params.id), status: 'PUBLISHED' },
    include: { questions: { orderBy: { order: 'asc' } }, org: { select: { name: true } } },
  });
  if (!job) throw notFound('Job');
  const { createdById: _c, hiringManagerId: _h, ...rest } = job;
  res.json(rest);
});

// ---------- Staff job management ----------
router.use(requireAuth, requireRole(...STAFF));

router.get('/', async (req, res) => {
  const user = me(req);
  const jobs = await prisma.job.findMany({
    where: {
      orgId: user.orgId!,
      ...(user.role === 'HIRING_MANAGER' && { hiringManagerId: user.id }),
      ...(req.query.status !== undefined && { status: z.enum(['DRAFT', 'PUBLISHED', 'PAUSED', 'CLOSED']).parse(req.query.status) }),
    },
    orderBy: { createdAt: 'desc' },
    include: {
      hiringManager: { select: { id: true, name: true } },
      _count: { select: { applications: true } },
    },
  });
  res.json(jobs);
});

router.get('/:id', async (req, res) => {
  await loadJob(me(req), String(req.params.id));
  const job = await prisma.job.findUniqueOrThrow({
    where: { id: String(req.params.id) },
    include: {
      questions: { orderBy: { order: 'asc' } },
      stages: { orderBy: { order: 'asc' }, include: { _count: { select: { applications: true } } } },
      criteria: { orderBy: { order: 'asc' } },
      hiringManager: { select: { id: true, name: true } },
      _count: { select: { applications: true } },
    },
  });
  res.json(job);
});

router.post('/', requireRole('EMPLOYER', 'RECRUITER'), async (req, res) => {
  const user = me(req);
  const body = jobFields
    .extend({
      questions: z.array(questionSchema).default([]),
      stages: z.array(stageSchema).optional(),
      pipelineTemplateId: z.string().optional(),
      criteria: z.array(z.string().trim().min(1)).optional(),
    })
    .refine(salaryOk, 'salaryMin cannot exceed salaryMax')
    .parse(req.body);
  await checkHiringManager(user.orgId, body.hiringManagerId);

  let stages = body.stages ?? DEFAULT_STAGES;
  if (!body.stages && body.pipelineTemplateId) {
    const tpl = await prisma.pipelineTemplate.findFirst({ where: { id: body.pipelineTemplateId, orgId: user.orgId! } });
    if (!tpl) throw notFound('Pipeline template');
    stages = z.array(stageSchema).parse(tpl.stages);
  }
  validateStages(stages);

  const { questions, stages: _s, pipelineTemplateId: _p, criteria, ...fields } = body;
  const job = await prisma.job.create({
    data: {
      ...fields,
      orgId: user.orgId!,
      createdById: user.id,
      questions: { create: questions.map((q, i) => ({ ...q, order: i })) },
      stages: { create: stages.map((s, i) => stageData(s, i)) },
      criteria: { create: (criteria ?? DEFAULT_CRITERIA).map((name, i) => ({ name, order: i })) },
    },
  });
  await audit(req, 'CREATE', 'Job', job.id, undefined, job);
  res.status(201).json(job);
});

router.patch('/:id', requireRole('EMPLOYER', 'RECRUITER'), async (req, res) => {
  const before = await loadJob(me(req), String(req.params.id), 'write');
  const body = jobFields.partial().parse(req.body);
  if (!salaryOk({ ...before, ...body })) throw badRequest('salaryMin cannot exceed salaryMax');
  await checkHiringManager(me(req).orgId, body.hiringManagerId);
  const job = await prisma.job.update({ where: { id: before.id }, data: body });
  await audit(req, 'UPDATE', 'Job', job.id, before, job);
  res.json(job);
});

router.post('/:id/status', requireRole('EMPLOYER', 'RECRUITER'), async (req, res) => {
  const before = await loadJob(me(req), String(req.params.id), 'write');
  const { status } = z.object({ status: z.enum(['DRAFT', 'PUBLISHED', 'PAUSED', 'CLOSED']) }).parse(req.body);
  if (!canTransitionJob(before.status, status)) {
    throw conflict(`Cannot change a ${before.status.toLowerCase()} job to ${status.toLowerCase()}`);
  }
  const job = await prisma.job.update({
    where: { id: before.id },
    data: {
      status,
      ...(status === 'PUBLISHED' && !before.publishedAt && { publishedAt: new Date() }),
      ...(status === 'CLOSED' && { closedAt: new Date() }),
    },
  });
  await audit(req, `STATUS_${status}`, 'Job', job.id, { status: before.status }, { status });
  res.json(job);
});

router.put('/:id/questions', requireRole('EMPLOYER', 'RECRUITER'), async (req, res) => {
  const job = await loadJob(me(req), String(req.params.id), 'write');
  const questions = z.array(questionSchema).parse(req.body);
  const applied = await prisma.application.count({ where: { jobId: job.id } });
  if (applied > 0) throw conflict('Questions are locked once candidates have applied');
  await prisma.$transaction([
    prisma.jobQuestion.deleteMany({ where: { jobId: job.id } }),
    prisma.jobQuestion.createMany({ data: questions.map((q, i) => ({ ...q, jobId: job.id, order: i })) }),
  ]);
  await audit(req, 'UPDATE_QUESTIONS', 'Job', job.id, undefined, questions);
  res.json(await prisma.jobQuestion.findMany({ where: { jobId: job.id }, orderBy: { order: 'asc' } }));
});

// USP G: per-vacancy workflow, edited as data.
router.put('/:id/stages', requireRole('EMPLOYER', 'RECRUITER'), async (req, res) => {
  const job = await loadJob(me(req), String(req.params.id), 'write');
  const before = await prisma.jobStage.findMany({ where: { jobId: job.id }, orderBy: { order: 'asc' } });
  const stages = await replaceStages(job.id, z.array(stageSchema).parse(req.body));
  await audit(req, 'UPDATE_PIPELINE', 'Job', job.id, before, stages);
  res.json(stages);
});

router.put('/:id/criteria', requireRole('EMPLOYER', 'RECRUITER'), async (req, res) => {
  const job = await loadJob(me(req), String(req.params.id), 'write');
  const names = z.array(z.string().trim().min(1)).min(1).parse(req.body);
  await prisma.$transaction([
    prisma.scorecardCriterion.deleteMany({ where: { jobId: job.id } }),
    prisma.scorecardCriterion.createMany({ data: names.map((name, i) => ({ jobId: job.id, name, order: i })) }),
  ]);
  await audit(req, 'UPDATE_CRITERIA', 'Job', job.id, undefined, names);
  res.json(await prisma.scorecardCriterion.findMany({ where: { jobId: job.id }, orderBy: { order: 'asc' } }));
});

/** Kanban data: one lean query, no per-card lookups. */
router.get('/:id/applications', async (req, res) => {
  const job = await loadJob(me(req), String(req.params.id));
  const apps = await prisma.application.findMany({
    where: { jobId: job.id },
    orderBy: { appliedAt: 'desc' },
    take: 500, // shortcut: board caps at 500 cards; paginate per column if a job gets more
    select: {
      id: true, status: true, source: true, appliedAt: true, updatedAt: true, currentStageId: true,
      candidate: { select: { id: true, skills: true, experienceYears: true, anonymizedAt: true, user: { select: { name: true } } } },
      _count: { select: { interviews: true } },
      approvals: { where: { status: 'PENDING' }, select: { id: true, targetStageId: true } },
    },
  });
  res.json(apps);
});

// ---------- Pipeline templates ----------
export const templatesRouter = Router();
templatesRouter.use(requireAuth, requireRole(...STAFF));
templatesRouter.get('/', async (req, res) => {
  res.json(await prisma.pipelineTemplate.findMany({ where: { orgId: me(req).orgId! }, orderBy: { name: 'asc' } }));
});
templatesRouter.post('/', requireRole('EMPLOYER', 'RECRUITER'), async (req, res) => {
  const body = z.object({ name: z.string().trim().min(2), stages: z.array(stageSchema) }).parse(req.body);
  validateStages(body.stages);
  const tpl = await prisma.pipelineTemplate.create({
    data: { orgId: me(req).orgId!, name: body.name, stages: body.stages.map(({ id: _id, ...s }) => s) },
  });
  await audit(req, 'CREATE', 'PipelineTemplate', tpl.id, undefined, tpl);
  res.status(201).json(tpl);
});
