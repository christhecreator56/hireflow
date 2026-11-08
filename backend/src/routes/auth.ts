import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { HttpError } from '../lib/http.js';
import { clearAuthCookie, me, requireAuth, setAuthCookie, signToken, type AuthUser } from '../lib/auth.js';
import { audit } from '../lib/audit.js';

export const POLICY_VERSION = '2026-11';
export const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: process.env.NODE_ENV === 'test' ? 1000 : 20,
  message: { error: 'Too many login attempts, try again later' },
});

const password = z.string().min(8, 'Password must be at least 8 characters').max(100);

const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email(),
  password,
  consent: z.literal(true, { errorMap: () => ({ message: 'You must accept the privacy policy' }) }),
  talentPoolConsent: z.boolean().optional(),
});

const toAuthUser = (u: { id: string; role: AuthUser['role']; orgId: string | null; name: string; email: string }): AuthUser => ({
  id: u.id,
  role: u.role,
  orgId: u.orgId,
  name: u.name,
  email: u.email,
});

/** Public sign-up is for candidates only; staff accounts are created by the employer. */
router.post('/register', loginLimiter, async (req, res) => {
  const body = registerSchema.parse(req.body);
  const exists = await prisma.user.findUnique({ where: { email: body.email } });
  if (exists) throw new HttpError(409, 'An account with this email already exists');
  const user = await prisma.user.create({
    data: {
      name: body.name,
      email: body.email,
      passwordHash: await bcrypt.hash(body.password, 10),
      role: 'CANDIDATE',
      profile: { create: { skills: [] } },
      consents: {
        create: [
          { type: 'DATA_PROCESSING', policyVersion: POLICY_VERSION, granted: true, ip: req.ip },
          ...(body.talentPoolConsent
            ? [{ type: 'TALENT_POOL', policyVersion: POLICY_VERSION, granted: true, ip: req.ip }]
            : []),
        ],
      },
    },
  });
  const authUser = toAuthUser(user);
  req.user = authUser;
  await audit(req, 'REGISTER', 'User', user.id);
  const token = signToken(authUser);
  setAuthCookie(res, token);
  res.status(201).json({ user: authUser, token });
});

router.post('/login', loginLimiter, async (req, res) => {
  const { email, password: pw } = z
    .object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1) })
    .parse(req.body);
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive || !(await bcrypt.compare(pw, user.passwordHash))) {
    throw new HttpError(401, 'Invalid email or password');
  }
  const authUser = toAuthUser(user);
  req.user = authUser;
  await audit(req, 'LOGIN', 'User', user.id);
  const token = signToken(authUser);
  setAuthCookie(res, token);
  res.json({ user: authUser, token });
});

router.post('/logout', (_req, res) => {
  clearAuthCookie(res);
  res.status(204).end();
});

router.get('/me', requireAuth, async (req, res) => {
  const org = me(req).orgId ? await prisma.organization.findUnique({ where: { id: me(req).orgId! } }) : null;
  res.json({ user: me(req), org });
});
