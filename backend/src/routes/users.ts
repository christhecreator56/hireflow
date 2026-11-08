import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { me, requireAuth, requireRole, STAFF } from '../lib/auth.js';
import { audit } from '../lib/audit.js';
import { notFound } from '../lib/http.js';

export const router = Router();
router.use(requireAuth);
const staffRole = z.enum(['EMPLOYER', 'RECRUITER', 'HIRING_MANAGER']);
const safe = { id: true, name: true, email: true, role: true, isActive: true, createdAt: true } as const;

// Any staff member can list colleagues (needed to pick interviewers / hiring managers).
router.get('/', requireRole(...STAFF), async (req, res) => {
  res.json(await prisma.user.findMany({ where: { orgId: me(req).orgId }, select: safe, orderBy: { name: 'asc' } }));
});

router.post('/', requireRole('EMPLOYER'), async (req, res) => {
  const body = z
    .object({
      name: z.string().trim().min(2),
      email: z.string().trim().toLowerCase().email(),
      role: staffRole,
      password: z.string().min(8),
    })
    .parse(req.body);
  const user = await prisma.user.create({
    data: {
      name: body.name,
      email: body.email,
      role: body.role,
      orgId: me(req).orgId,
      passwordHash: await bcrypt.hash(body.password, 10),
    },
    select: safe,
  });
  await audit(req, 'CREATE', 'User', user.id, undefined, user);
  res.status(201).json(user);
});

router.patch('/:id', requireRole('EMPLOYER'), async (req, res) => {
  const body = z.object({ role: staffRole.optional(), isActive: z.boolean().optional() }).parse(req.body);
  const before = await prisma.user.findFirst({ where: { id: String(req.params.id), orgId: me(req).orgId }, select: safe });
  if (!before) throw notFound('User');
  const user = await prisma.user.update({ where: { id: before.id }, data: body, select: safe });
  await audit(req, 'UPDATE', 'User', user.id, before, user);
  res.json(user);
});
