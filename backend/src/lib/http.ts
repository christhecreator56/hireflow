import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import multer from 'multer';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what = 'Resource') => new HttpError(404, `${what} not found`);
export const forbidden = (msg = 'You do not have permission to do this') => new HttpError(403, msg);
export const badRequest = (msg: string, details?: unknown) => new HttpError(400, msg, details);
export const conflict = (msg: string) => new HttpError(409, msg);

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  if (err instanceof ZodError) {
    const { formErrors, fieldErrors } = err.flatten(); // formErrors = object-level .refine() messages
    return res.status(400).json({ error: formErrors[0] ?? 'Validation failed', details: fieldErrors });
  }
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.message });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Already exists' });
    if (err.code === 'P2025') return res.status(404).json({ error: 'Not found' });
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
}

export const page = (q: { page?: unknown; pageSize?: unknown }) => {
  const pageSize = Math.min(Math.max(Number(q.pageSize) || 20, 1), 100);
  const p = Math.max(Number(q.page) || 1, 1);
  return { skip: (p - 1) * pageSize, take: pageSize, page: p, pageSize };
};
