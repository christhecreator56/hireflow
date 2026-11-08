import { randomBytes } from 'node:crypto';
import { prisma } from './prisma.js';
import { deleteObject } from './storage.js';
import { audit } from './audit.js';

/** Everything we hold about a candidate, as plain JSON (GDPR-style access request). */
export async function exportCandidateData(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
      consents: true,
      notifications: true,
      dataRequests: true,
      profile: {
        include: {
          resumes: { select: { id: true, fileName: true, mimeType: true, size: true, uploadedAt: true } },
          applications: {
            include: {
              job: { select: { title: true, department: true } },
              currentStage: { select: { name: true } },
              answers: { include: { question: { select: { label: true } } } },
              transitions: { include: { toStage: { select: { name: true } } } },
              interviews: { select: { title: true, scheduledAt: true, mode: true, status: true } },
            },
          },
        },
      },
    },
  });
  const emails = await prisma.emailLog.findMany({
    where: { toEmail: user.email },
    select: { subject: true, status: true, createdAt: true },
  });
  return { exportedAt: new Date().toISOString(), ...user, emails };
}

/**
 * Right to erasure without breaking analytics: PII is wiped and files deleted,
 * while applications/stage history stay as anonymous rows.
 */
export async function anonymizeCandidate(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { profile: { include: { resumes: true } } } });
  const resumes = user.profile?.resumes ?? [];
  await Promise.allSettled(resumes.map((r) => deleteObject(r.fileKey)));
  const placeholder = `deleted-${user.id}@anonymized.local`;

  await prisma.$transaction(async (tx) => {
    await tx.emailLog.updateMany({ where: { toEmail: user.email }, data: { toEmail: placeholder } });
    await tx.user.update({
      where: { id: userId },
      data: { name: 'Deleted Candidate', email: placeholder, passwordHash: randomBytes(32).toString('hex'), isActive: false },
    });
    if (user.profile) {
      await tx.resume.deleteMany({ where: { candidateId: user.profile.id } });
      await tx.applicationAnswer.deleteMany({ where: { application: { candidateId: user.profile.id } } });
      await tx.note.deleteMany({ where: { application: { candidateId: user.profile.id } } });
      await tx.candidateProfile.update({
        where: { id: user.profile.id },
        data: { phone: null, location: null, linkedin: null, headline: null, skills: [], experienceYears: null, anonymizedAt: new Date() },
      });
    }
    await tx.notification.deleteMany({ where: { userId } });
  });
}

/** Anonymize candidates whose every application in this org closed > retentionDays ago. */
export async function runRetention(orgId: string) {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
  const cutoff = new Date(Date.now() - org.retentionDays * 24 * 60 * 60_000);
  const candidates = await prisma.candidateProfile.findMany({
    where: {
      anonymizedAt: null,
      applications: {
        some: { job: { orgId } },
        every: { status: { in: ['REJECTED', 'WITHDRAWN'] }, updatedAt: { lt: cutoff } },
      },
    },
    select: { userId: true },
  });
  for (const c of candidates) await anonymizeCandidate(c.userId);
  await audit(null, 'RETENTION_RUN', 'Organization', orgId, undefined, { anonymized: candidates.length, cutoff });
  return { anonymized: candidates.length, cutoff };
}
