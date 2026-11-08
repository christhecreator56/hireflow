import type { Request } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';

const json = (v: unknown) =>
  v === undefined ? undefined : (JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue);

/** Append-only audit trail. Every write path calls this. */
export function audit(
  req: Request | null,
  action: string,
  entityType: string,
  entityId?: string | null,
  before?: unknown,
  after?: unknown,
) {
  return prisma.auditLog.create({
    data: {
      actorId: req?.user?.id,
      actorRole: req?.user?.role ?? (req ? undefined : 'SYSTEM'),
      action,
      entityType,
      entityId: entityId ?? undefined,
      before: json(before),
      after: json(after),
      ip: req?.ip,
    },
  });
}
