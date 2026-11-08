import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { Role } from '@prisma/client';
import { env } from './env.js';
import { HttpError, forbidden } from './http.js';

export type AuthUser = { id: string; role: Role; orgId: string | null; name: string; email: string };

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export const STAFF: Role[] = ['EMPLOYER', 'RECRUITER', 'HIRING_MANAGER'];
const COOKIE = 'token';
const TTL_SECONDS = 8 * 60 * 60;

export const signToken = (u: AuthUser) => jwt.sign(u, env.jwtSecret, { expiresIn: TTL_SECONDS });

export function setAuthCookie(res: Response, token: string) {
  // shortcut: single 8h httpOnly token, no refresh rotation; add refresh tokens if sessions must outlive 8h
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.cookieSecure,
    maxAge: TTL_SECONDS * 1000,
  });
}

export const clearAuthCookie = (res: Response) => res.clearCookie(COOKIE);

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = req.cookies?.[COOKIE] ?? (header?.startsWith('Bearer ') ? header.slice(7) : undefined);
  if (!token) throw new HttpError(401, 'Authentication required');
  try {
    const { id, role, orgId, name, email } = jwt.verify(token, env.jwtSecret) as AuthUser;
    req.user = { id, role, orgId, name, email };
  } catch {
    throw new HttpError(401, 'Invalid or expired session');
  }
  next();
}

export const requireRole =
  (...roles: Role[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw new HttpError(401, 'Authentication required');
    if (!roles.includes(req.user.role)) throw forbidden();
    next();
  };

/** Non-null user accessor for handlers mounted behind requireAuth. */
export const me = (req: Request) => req.user as AuthUser;
