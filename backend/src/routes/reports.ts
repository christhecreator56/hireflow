import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { me, requireAuth, requireRole, STAFF, type AuthUser } from '../lib/auth.js';

export const router = Router();
router.use(requireAuth, requireRole(...STAFF));

/** Shared filter: org scope, hiring managers see only their jobs, optional job + date range. */
const date = (v: unknown) => z.coerce.date({ errorMap: () => ({ message: 'Invalid date' }) }).parse(v);

function scope(user: AuthUser, q: Record<string, unknown>) {
  const parts = [Prisma.sql`j."orgId" = ${user.orgId}`];
  if (user.role === 'HIRING_MANAGER') parts.push(Prisma.sql`j."hiringManagerId" = ${user.id}`);
  if (typeof q.jobId === 'string' && q.jobId) parts.push(Prisma.sql`j.id = ${q.jobId}`);
  if (typeof q.from === 'string' && q.from) parts.push(Prisma.sql`a."appliedAt" >= ${date(q.from)}`);
  if (typeof q.to === 'string' && q.to) parts.push(Prisma.sql`a."appliedAt" <= ${date(q.to)}`);
  return Prisma.join(parts, ' AND ');
}

const num = <T extends Record<string, unknown>>(rows: T[]) =>
  rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'bigint' ? Number(v) : v])));

// Aggregations run in SQL (one round trip each), never by loading rows into Node.
router.get('/overview', async (req, res) => {
  const where = scope(me(req), req.query);
  const [row] = await prisma.$queryRaw<Record<string, bigint>[]>`
    SELECT COUNT(*) AS total,
      COUNT(*) FILTER (WHERE a.status = 'ACTIVE') AS active,
      COUNT(*) FILTER (WHERE a.status = 'HIRED') AS hired,
      COUNT(*) FILTER (WHERE a.status = 'REJECTED') AS rejected,
      COUNT(*) FILTER (WHERE a."appliedAt" > now() - interval '7 days') AS "last7Days"
    FROM "Application" a JOIN "Job" j ON j.id = a."jobId" WHERE ${where}`;
  const [iv] = await prisma.$queryRaw<Record<string, bigint>[]>`
    SELECT COUNT(*) AS upcoming FROM "Interview" i
    JOIN "Application" a ON a.id = i."applicationId" JOIN "Job" j ON j.id = a."jobId"
    WHERE ${where} AND i.status = 'SCHEDULED' AND i."scheduledAt" > now()`;
  res.json(num([{ ...row, upcomingInterviews: iv.upcoming }])[0]);
});

router.get('/time-to-stage', async (req, res) => {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT s.name AS stage, MIN(s."order") AS "order",
      ROUND(AVG(EXTRACT(EPOCH FROM (t."createdAt" - a."appliedAt")) / 86400)::numeric, 1)::float AS "avgDays",
      COUNT(DISTINCT a.id) AS candidates
    FROM "StageTransition" t
    JOIN "Application" a ON a.id = t."applicationId"
    JOIN "JobStage" s ON s.id = t."toStageId"
    JOIN "Job" j ON j.id = a."jobId"
    WHERE ${scope(me(req), req.query)} AND t."fromStageId" IS NOT NULL
    GROUP BY s.name ORDER BY MIN(s."order")`;
  res.json(num(rows));
});

router.get('/sources', async (req, res) => {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT a.source, COUNT(*) AS count,
      COUNT(*) FILTER (WHERE a.status = 'HIRED') AS hired
    FROM "Application" a JOIN "Job" j ON j.id = a."jobId"
    WHERE ${scope(me(req), req.query)} GROUP BY a.source ORDER BY count DESC`;
  res.json(num(rows));
});

router.get('/vacancies', async (req, res) => {
  const user = me(req);
  const rows = await prisma.job.groupBy({
    by: ['status'],
    where: { orgId: user.orgId!, ...(user.role === 'HIRING_MANAGER' && { hiringManagerId: user.id }) },
    _count: { _all: true },
  });
  res.json(rows.map((r) => ({ status: r.status, count: r._count._all })));
});

/** Conversion: share of all applicants who ever reached each stage. */
router.get('/funnel', async (req, res) => {
  const where = scope(me(req), req.query);
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    WITH reached AS (
      SELECT DISTINCT a.id AS app, s.name, s."order"
      FROM "StageTransition" t
      JOIN "Application" a ON a.id = t."applicationId"
      JOIN "JobStage" s ON s.id = t."toStageId"
      JOIN "Job" j ON j.id = a."jobId"
      WHERE ${where} AND s.category <> 'REJECTED'
    ), total AS (
      SELECT COUNT(*) AS n FROM "Application" a JOIN "Job" j ON j.id = a."jobId" WHERE ${where}
    )
    SELECT name AS stage, MIN("order") AS "order", COUNT(*) AS count,
      ROUND(100.0 * COUNT(*) / NULLIF((SELECT n FROM total), 0), 1)::float AS percent
    FROM reached GROUP BY name ORDER BY MIN("order")`;
  res.json(num(rows));
});
