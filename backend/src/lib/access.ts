import type { JobStatus } from '@prisma/client';
import type { AuthUser } from './auth.js';
import { prisma } from './prisma.js';
import { forbidden, notFound } from './http.js';

type JobRef = { orgId: string; hiringManagerId: string | null };

/** Single place that decides who may see a job's candidates (prevents IDOR leaks). */
export function canSeeJob(user: AuthUser, job: JobRef) {
  if (user.role === 'CANDIDATE' || job.orgId !== user.orgId) return false;
  if (user.role === 'HIRING_MANAGER') return job.hiringManagerId === user.id;
  return true;
}

export function canSeeApplication(user: AuthUser, app: { job: JobRef; candidate: { userId: string } }) {
  if (user.role === 'CANDIDATE') return app.candidate.userId === user.id;
  return canSeeJob(user, app.job);
}

export const canEditJob = (user: AuthUser, job: JobRef) =>
  (user.role === 'EMPLOYER' || user.role === 'RECRUITER') && job.orgId === user.orgId;

export async function loadJob(user: AuthUser, id: string, mode: 'read' | 'write' = 'read') {
  const job = await prisma.job.findUnique({ where: { id } });
  if (!job || job.orgId !== user.orgId) throw notFound('Job');
  if (mode === 'write' ? !canEditJob(user, job) : !canSeeJob(user, job)) throw forbidden();
  return job;
}

export async function loadApplication(user: AuthUser, id: string) {
  const app = await prisma.application.findUnique({
    where: { id },
    include: { job: true, candidate: { include: { user: true } }, currentStage: true },
  });
  if (!app) throw notFound('Application');
  if (!canSeeApplication(user, app)) throw forbidden();
  return app;
}

const JOB_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  DRAFT: ['PUBLISHED', 'CLOSED'],
  PUBLISHED: ['PAUSED', 'CLOSED'],
  PAUSED: ['PUBLISHED', 'CLOSED'],
  CLOSED: [],
};
export const canTransitionJob = (from: JobStatus, to: JobStatus) => JOB_TRANSITIONS[from].includes(to);

/** Interviewers only need to judge skills: hide contact details. */
export function maskPII<T extends { email?: string | null; phone?: string | null }>(p: T): T {
  const email = p.email ? p.email.replace(/^(.).*(@.*)$/, '$1***$2') : p.email;
  const phone = p.phone ? p.phone.replace(/.(?=.{2})/g, '*') : p.phone;
  return { ...p, email, phone };
}
