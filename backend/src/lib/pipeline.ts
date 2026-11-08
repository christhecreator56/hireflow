import type { Prisma, Role, StageCategory } from '@prisma/client';
import type { AuthUser } from './auth.js';
import { prisma } from './prisma.js';
import { badRequest, conflict, forbidden, notFound } from './http.js';
import { sendTemplate, type MailVars } from './mailer.js';

export type StageInput = {
  id?: string;
  name: string;
  category?: StageCategory;
  notifyCandidate?: boolean;
  emailTemplateKey?: string | null;
  requiresApproval?: boolean;
  approverRole?: Role | null;
};

export const DEFAULT_STAGES: StageInput[] = [
  { name: 'Applied', notifyCandidate: false },
  { name: 'Screening', notifyCandidate: true, emailTemplateKey: 'stage_changed' },
  { name: 'Assessment', notifyCandidate: true, emailTemplateKey: 'stage_changed' },
  { name: 'Interview', notifyCandidate: true, emailTemplateKey: 'stage_changed' },
  {
    name: 'Offer',
    notifyCandidate: true,
    emailTemplateKey: 'offer',
    requiresApproval: true,
    approverRole: 'HIRING_MANAGER',
  },
  { name: 'Hired', category: 'HIRED', notifyCandidate: true, emailTemplateKey: 'hired' },
  { name: 'Rejected', category: 'REJECTED', notifyCandidate: true, emailTemplateKey: 'rejected' },
];

export const DEFAULT_CRITERIA = ['Technical skills', 'Problem solving', 'Communication', 'Culture fit'];

/** Rules a stage list must satisfy; enforced on create and on edit. */
export function validateStages(stages: StageInput[]) {
  if (stages.length < 2) throw badRequest('A pipeline needs at least 2 stages');
  if ((stages[0].category ?? 'ACTIVE') !== 'ACTIVE') throw badRequest('First stage must be an active stage');
  if (!stages.some((s) => s.category === 'REJECTED')) throw badRequest('Pipeline needs a Rejected stage');
  const names = stages.map((s) => s.name.trim().toLowerCase());
  if (new Set(names).size !== names.length) throw badRequest('Stage names must be unique');
  for (const s of stages)
    if (s.requiresApproval && !s.approverRole) throw badRequest(`Stage "${s.name}" needs an approver role`);
}

export const stageData = (s: StageInput, order: number) => ({
  name: s.name.trim(),
  order,
  category: s.category ?? 'ACTIVE',
  notifyCandidate: s.notifyCandidate ?? false,
  emailTemplateKey: s.emailTemplateKey ?? null,
  requiresApproval: s.requiresApproval ?? false,
  approverRole: s.requiresApproval ? (s.approverRole ?? null) : null,
});

/** EMPLOYER can always approve; otherwise role must match (and HM must own the job). */
export function canApprove(
  user: AuthUser,
  stage: { approverRole: Role | null },
  job: { hiringManagerId: string | null },
) {
  if (user.role === 'EMPLOYER') return true;
  if (user.role !== stage.approverRole) return false;
  return user.role !== 'HIRING_MANAGER' || job.hiringManagerId === user.id;
}

const statusFor = (c: StageCategory) => (c === 'HIRED' ? 'HIRED' : c === 'REJECTED' ? 'REJECTED' : 'ACTIVE');

export async function notifyCandidate(applicationId: string, templateKey: string, extra: MailVars = {}) {
  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    include: { job: { include: { org: true } }, candidate: { include: { user: true } }, currentStage: true },
  });
  if (!app || app.candidate.anonymizedAt) return;
  const vars = {
    candidateName: app.candidate.user.name,
    jobTitle: app.job.title,
    stageName: app.currentStage.name,
    companyName: app.job.org.name,
    ...extra,
  };
  await prisma.notification.create({
    data: { userId: app.candidate.userId, message: `${app.job.title}: ${templateKey.replace(/_/g, ' ')} (${vars.stageName})` },
  });
  return sendTemplate({ orgId: app.job.orgId, key: templateKey, to: app.candidate.user.email, vars, applicationId });
}

type MoveResult =
  | { moved: true; application: Prisma.ApplicationGetPayload<object> }
  | { moved: false; approvalId: string };

/**
 * The one way an application changes stage. Enforces: stage belongs to the job,
 * application still active, approval gates, and no lost update on concurrent moves.
 */
export async function moveApplication(opts: {
  applicationId: string;
  toStageId: string;
  actor: AuthUser;
  note?: string;
  rejectionReason?: string;
  approved?: boolean; // set when called from an approval decision
}): Promise<MoveResult> {
  const app = await prisma.application.findUnique({ where: { id: opts.applicationId }, include: { job: true } });
  if (!app) throw notFound('Application');
  if (app.status !== 'ACTIVE') throw conflict(`Application is ${app.status.toLowerCase()} and cannot be moved`);
  const to = await prisma.jobStage.findUnique({ where: { id: opts.toStageId } });
  if (!to || to.jobId !== app.jobId) throw badRequest('Stage does not belong to this job');
  if (to.id === app.currentStageId) throw badRequest('Application is already in this stage');

  if (to.requiresApproval && !opts.approved) {
    if (!canApprove(opts.actor, to, app.job)) {
      const existing = await prisma.stageApproval.findFirst({
        where: { applicationId: app.id, targetStageId: to.id, status: 'PENDING' },
      });
      const approval =
        existing ??
        (await prisma.stageApproval.create({
          data: { applicationId: app.id, targetStageId: to.id, requestedById: opts.actor.id, comment: opts.note },
        }));
      return { moved: false, approvalId: approval.id };
    }
    // actor is an approver: record self-approval for traceability, then move
    await prisma.stageApproval.create({
      data: {
        applicationId: app.id,
        targetStageId: to.id,
        requestedById: opts.actor.id,
        approverId: opts.actor.id,
        status: 'APPROVED',
        decidedAt: new Date(),
      },
    });
  }

  const application = await prisma.$transaction(async (tx) => {
    // optimistic lock: only move if nobody moved it since we read it
    const { count } = await tx.application.updateMany({
      where: { id: app.id, currentStageId: app.currentStageId, status: 'ACTIVE' },
      data: {
        currentStageId: to.id,
        status: statusFor(to.category),
        rejectionReason: to.category === 'REJECTED' ? (opts.rejectionReason ?? opts.note ?? null) : null,
      },
    });
    if (count === 0) throw conflict('Application was changed by someone else, refresh and retry');
    await tx.stageTransition.create({
      data: { applicationId: app.id, fromStageId: app.currentStageId, toStageId: to.id, movedById: opts.actor.id, note: opts.note },
    });
    return tx.application.findUniqueOrThrow({ where: { id: app.id } });
  });

  if (to.notifyCandidate && to.emailTemplateKey) await notifyCandidate(app.id, to.emailTemplateKey);
  return { moved: true, application };
}

export async function rejectApplication(applicationId: string, actor: AuthUser, reason: string) {
  const app = await prisma.application.findUnique({ where: { id: applicationId } });
  if (!app) throw notFound('Application');
  const stage = await prisma.jobStage.findFirst({ where: { jobId: app.jobId, category: 'REJECTED' } });
  if (!stage) throw badRequest('This job has no Rejected stage configured');
  return moveApplication({ applicationId, toStageId: stage.id, actor, note: reason, rejectionReason: reason });
}

/** Replace a job's stage list in place; refuses to drop a stage that still holds candidates. */
export async function replaceStages(jobId: string, stages: StageInput[]) {
  validateStages(stages);
  const current = await prisma.jobStage.findMany({
    where: { jobId },
    include: { _count: { select: { applications: true } } },
  });
  const keep = new Set(stages.map((s) => s.id).filter(Boolean));
  for (const s of stages) if (s.id && !current.some((c) => c.id === s.id)) throw badRequest(`Unknown stage id ${s.id}`);
  const removed = current.filter((c) => !keep.has(c.id));
  const blocked = removed.find((c) => c._count.applications > 0);
  if (blocked) throw conflict(`Stage "${blocked.name}" still has ${blocked._count.applications} candidate(s); move them first`);

  await prisma.$transaction([
    prisma.jobStage.deleteMany({ where: { id: { in: removed.map((r) => r.id) } } }),
    ...stages.map((s, i) =>
      s.id
        ? prisma.jobStage.update({ where: { id: s.id }, data: stageData(s, i) })
        : prisma.jobStage.create({ data: { jobId, ...stageData(s, i) } }),
    ),
  ]);
  return prisma.jobStage.findMany({ where: { jobId }, orderBy: { order: 'asc' } });
}

export function overlaps(aStart: Date, aMin: number, bStart: Date, bMin: number) {
  const aEnd = aStart.getTime() + aMin * 60_000;
  const bEnd = bStart.getTime() + bMin * 60_000;
  return aStart.getTime() < bEnd && bStart.getTime() < aEnd;
}

/** Returns the names of interviewers already booked in [start, start+duration). */
export async function findClashes(userIds: string[], start: Date, durationMin: number, ignoreInterviewId?: string) {
  const dayMs = 24 * 60 * 60_000;
  const nearby = await prisma.interview.findMany({
    where: {
      status: 'SCHEDULED',
      id: ignoreInterviewId ? { not: ignoreInterviewId } : undefined,
      scheduledAt: { gte: new Date(start.getTime() - dayMs), lte: new Date(start.getTime() + dayMs) },
      panel: { some: { userId: { in: userIds } } },
    },
    include: { panel: { include: { user: true } } },
  });
  const clashes = new Set<string>();
  for (const iv of nearby)
    if (overlaps(start, durationMin, iv.scheduledAt, iv.durationMin))
      for (const p of iv.panel) if (userIds.includes(p.userId)) clashes.add(p.user.name);
  return [...clashes];
}

export const forbidUnlessApprover = (user: AuthUser, stage: { approverRole: Role | null }, job: { hiringManagerId: string | null }) => {
  if (!canApprove(user, stage, job)) throw forbidden('Only the configured approver can decide this');
};
