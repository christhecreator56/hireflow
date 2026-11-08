import bcrypt from 'bcryptjs';
import request from 'supertest';
import { prisma } from '../src/lib/prisma.js';
import { app } from '../src/app.js';
import { DEFAULT_CRITERIA, DEFAULT_STAGES, stageData } from '../src/lib/pipeline.js';
import { ensureBucket } from '../src/lib/storage.js';
import type { Role } from '@prisma/client';

export const API = '/api/v1';
export const PASSWORD = 'Passw0rd!123';

export async function truncateAll() {
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  const list = rows.map((r) => `"${r.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

export async function mkUser(role: Role, orgId: string | null, email: string, name = email.split('@')[0]) {
  return prisma.user.create({
    data: {
      email,
      name,
      role,
      orgId,
      passwordHash: await bcrypt.hash(PASSWORD, 4),
      ...(role === 'CANDIDATE' ? { profile: { create: { skills: [], phone: '+91 98765 43210' } } } : {}),
    },
  });
}

export async function mkJob(orgId: string, createdById: string, hiringManagerId: string | null, status: 'DRAFT' | 'PUBLISHED' = 'PUBLISHED', extra: Record<string, unknown> = {}) {
  return prisma.job.create({
    data: {
      orgId,
      createdById,
      hiringManagerId,
      title: 'Backend Engineer',
      description: 'Build great APIs for our ATS.',
      status,
      publishedAt: status === 'PUBLISHED' ? new Date() : null,
      stages: { create: DEFAULT_STAGES.map((s, i) => stageData(s, i)) },
      criteria: { create: DEFAULT_CRITERIA.map((name, i) => ({ name, order: i })) },
      ...extra,
    },
    include: { stages: { orderBy: { order: 'asc' } }, questions: true },
  });
}

/** Fresh world: org, one user per staff role (+ second HM), two candidates, templates, published job. */
export async function seedWorld() {
  await truncateAll();
  await ensureBucket();
  const org = await prisma.organization.create({ data: { name: 'Acme Test Co' } });
  const employer = await mkUser('EMPLOYER', org.id, 'employer@test.local');
  const recruiter = await mkUser('RECRUITER', org.id, 'recruiter@test.local');
  const hm = await mkUser('HIRING_MANAGER', org.id, 'hm@test.local');
  const hm2 = await mkUser('HIRING_MANAGER', org.id, 'hm2@test.local');
  const cand = await mkUser('CANDIDATE', null, 'cand@test.local');
  const cand2 = await mkUser('CANDIDATE', null, 'cand2@test.local');
  const keys = ['application_received', 'stage_changed', 'offer', 'hired', 'rejected', 'interview_scheduled'];
  await prisma.emailTemplate.createMany({
    data: keys.map((key) => ({ orgId: org.id, key, name: key, subject: `${key} {{jobTitle}}`, bodyHtml: '<p>Hi {{candidateName}}</p>' })),
  });
  const job = await mkJob(org.id, recruiter.id, hm.id);
  return { org, employer, recruiter, hm, hm2, cand, cand2, job };
}

export async function login(email: string, password = PASSWORD) {
  const agent = request.agent(app);
  const res = await agent.post(`${API}/auth/login`).send({ email, password });
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status}`);
  return agent;
}

export const stageId = (job: { stages: { id: string; name: string }[] }, name: string) => {
  const s = job.stages.find((x) => x.name === name);
  if (!s) throw new Error(`no stage ${name}`);
  return s.id;
};

export async function applyAs(agent: request.Agent, jobId: string, body: object = {}) {
  return agent.post(`${API}/jobs/${jobId}/apply`).send(body);
}

export { app, prisma, request };
