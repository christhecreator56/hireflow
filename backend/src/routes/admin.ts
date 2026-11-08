import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { me, requireAuth, requireRole } from '../lib/auth.js';
import { audit } from '../lib/audit.js';
import { conflict, notFound, page } from '../lib/http.js';
import { anonymizeCandidate, runRetention } from '../lib/governance.js';

export const router = Router();
router.use(requireAuth);

// ---------- Org settings / retention (USP H) ----------
router.get('/org', requireRole('EMPLOYER', 'RECRUITER'), async (req, res) => {
  res.json(await prisma.organization.findUnique({ where: { id: me(req).orgId! } }));
});

router.patch('/org', requireRole('EMPLOYER'), async (req, res) => {
  const body = z.object({ name: z.string().trim().min(2).optional(), retentionDays: z.number().int().min(30).max(3650).optional() }).parse(req.body);
  const before = await prisma.organization.findUniqueOrThrow({ where: { id: me(req).orgId! } });
  const org = await prisma.organization.update({ where: { id: before.id }, data: body });
  await audit(req, 'UPDATE', 'Organization', org.id, before, org);
  res.json(org);
});

router.post('/retention/run', requireRole('EMPLOYER'), async (req, res) => {
  const result = await runRetention(me(req).orgId!);
  await audit(req, 'RETENTION_TRIGGERED', 'Organization', me(req).orgId);
  res.json(result);
});

// ---------- Data requests ----------
// Candidates have no org; a request belongs to an org if the candidate applied to one of its jobs.
const inOrg = (orgId: string) => ({ user: { profile: { applications: { some: { job: { orgId } } } } } });

router.get('/data-requests', requireRole('EMPLOYER'), async (req, res) => {
  res.json(
    await prisma.dataRequest.findMany({
      where: inOrg(me(req).orgId!),
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { name: true, email: true } } },
    }),
  );
});

router.post('/data-requests/:id/decide', requireRole('EMPLOYER'), async (req, res) => {
  const { approve } = z.object({ approve: z.boolean() }).parse(req.body);
  const dr = await prisma.dataRequest.findFirst({ where: { id: String(req.params.id), ...inOrg(me(req).orgId!) } });
  if (!dr) throw notFound('Data request');
  if (dr.status !== 'PENDING') throw conflict('Request already processed');
  if (approve) await anonymizeCandidate(dr.userId);
  const updated = await prisma.dataRequest.update({
    where: { id: dr.id },
    data: { status: approve ? 'COMPLETED' : 'REJECTED', reviewedById: me(req).id, completedAt: new Date() },
  });
  await audit(req, approve ? 'DELETION_COMPLETED' : 'DELETION_REJECTED', 'DataRequest', dr.id);
  res.json(updated);
});

// ---------- Audit history ----------
router.get('/audit-logs', requireRole('EMPLOYER', 'RECRUITER'), async (req, res) => {
  const q = z
    .object({ entityType: z.string().optional(), entityId: z.string().optional(), actorId: z.string().optional(), action: z.string().optional() })
    .parse(req.query);
  const { skip, take, ...p } = page(req.query);
  // Org scope: actor in my org, or system jobs. shortcut: candidate-originated rows are visible org-wide; add orgId to AuditLog for multi-tenant.
  const orgUsers = await prisma.user.findMany({ where: { orgId: me(req).orgId }, select: { id: true } });
  const where = {
    ...q,
    OR: [{ actorId: { in: orgUsers.map((u) => u.id) } }, { actorRole: { in: ['CANDIDATE', 'SYSTEM'] } }],
  };
  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
    prisma.auditLog.count({ where }),
  ]);
  const actors = await prisma.user.findMany({
    where: { id: { in: items.map((i) => i.actorId).filter((x): x is string => !!x) } },
    select: { id: true, name: true },
  });
  res.json({ ...p, total, items: items.map((i) => ({ ...i, actorName: actors.find((a) => a.id === i.actorId)?.name ?? 'System' })) });
});

// ---------- Email templates + log ----------
router.get('/email-templates', requireRole('EMPLOYER', 'RECRUITER', 'HIRING_MANAGER'), async (req, res) => {
  res.json(await prisma.emailTemplate.findMany({ where: { orgId: me(req).orgId! }, orderBy: { name: 'asc' } }));
});

router.put('/email-templates/:key', requireRole('EMPLOYER', 'RECRUITER'), async (req, res) => {
  const body = z
    .object({ name: z.string().trim().min(2), subject: z.string().trim().min(2).max(200), bodyHtml: z.string().min(5).max(20000) })
    .parse(req.body);
  const key = z.string().regex(/^[a-z_]{3,40}$/).parse(String(req.params.key));
  const orgId = me(req).orgId!;
  const tpl = await prisma.emailTemplate.upsert({
    where: { orgId_key: { orgId, key } },
    create: { orgId, key, ...body },
    update: body,
  });
  await audit(req, 'UPSERT', 'EmailTemplate', tpl.id, undefined, tpl);
  res.json(tpl);
});

router.get('/email-logs', requireRole('EMPLOYER', 'RECRUITER'), async (req, res) => {
  const { skip, take } = page(req.query);
  res.json(
    await prisma.emailLog.findMany({
      where: { orgId: me(req).orgId },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
  );
});
