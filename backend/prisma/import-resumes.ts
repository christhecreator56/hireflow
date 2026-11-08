/**
 * Bulk-import a folder of PDF resumes as candidates and apply them to matching published jobs.
 * Usage: npm run db:import-resumes -- <folder>   (default ../import/resumes)
 * Idempotent: a candidate whose email already exists is skipped.
 */
import '../src/lib/env.js';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { ensureBucket, putObject } from '../src/lib/storage.js';
import { nameFromFileName, parseResume } from '../src/lib/resumeParser.js';

export const DEMO_PASSWORD = 'Password123!';

export const skillOverlap = (have: string[], want: string[]) =>
  want.length ? want.filter((w) => have.some((h) => h.toLowerCase() === w.toLowerCase())).length / want.length : 0;

export const resumeFiles = (dir: string) => readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.pdf'));

/** Parse one PDF, create the candidate user + profile, and store the original file in S3. */
export async function createCandidateFromResume(prisma: PrismaClient, dir: string, file: string, passwordHash: string, loginEmail?: string) {
  const buf = readFileSync(join(dir, file));
  const parsed = await parseResume(buf);
  const name = nameFromFileName(file);
  const email = loginEmail ?? parsed.email ?? `${name.toLowerCase().replace(/[^a-z]+/g, '.').replace(/^\.|\.$/g, '')}@resume-import.local`;
  if (await prisma.user.findUnique({ where: { email } })) return null;
  const user = await prisma.user.create({
    data: {
      name,
      email,
      role: 'CANDIDATE',
      passwordHash,
      profile: {
        create: {
          phone: parsed.phone,
          location: parsed.location,
          linkedin: parsed.linkedin,
          headline: parsed.headline ?? 'Computer Science student',
          skills: parsed.skills,
        },
      },
      consents: { create: { type: 'BULK_IMPORT', policyVersion: '2026-11', granted: true } },
    },
    include: { profile: true },
  });
  const profile = user.profile!;
  const key = `resumes/${profile.id}/${randomUUID()}`;
  await putObject(key, buf, 'application/pdf');
  const resume = await prisma.resume.create({
    data: { candidateId: profile.id, fileKey: key, fileName: file, mimeType: 'application/pdf', size: statSync(join(dir, file)).size },
  });
  return { user, profile, resume, parsed, file };
}

async function main() {
  const prisma = new PrismaClient();
  const dir = resolve(process.argv[2] ?? '../import/resumes');
  try {
    await ensureBucket();
    const recruiter = await prisma.user.findFirst({ where: { role: 'RECRUITER' } });
    const jobs = await prisma.job.findMany({ where: { status: 'PUBLISHED' }, include: { stages: { orderBy: { order: 'asc' }, take: 1 } } });
    if (!recruiter || !jobs.length) throw new Error('Run the seed first: need a recruiter and published jobs');
    const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
    const rows: string[] = [];
    const files = resumeFiles(dir);
    for (const file of files) {
      const c = await createCandidateFromResume(prisma, dir, file, hash);
      if (!c) {
        rows.push(`skip  ${file} (already imported)`);
        continue;
      }
      // Apply to every published job with ≥25% skill overlap, else the single best fit.
      const ranked = jobs.map((j) => ({ j, m: skillOverlap(c.parsed.skills, j.skills) })).sort((a, b) => b.m - a.m);
      const targets = ranked.some((r) => r.m >= 0.25) ? ranked.filter((r) => r.m >= 0.25) : ranked.slice(0, 1);
      for (const { j } of targets) {
        await prisma.application.create({
          data: {
            jobId: j.id,
            candidateId: c.profile.id,
            currentStageId: j.stages[0].id,
            resumeId: c.resume.id,
            source: 'OTHER',
            transitions: { create: { toStageId: j.stages[0].id, movedById: recruiter.id, note: 'Imported from resume batch' } },
          },
        });
      }
      await prisma.auditLog.create({
        data: { actorId: recruiter.id, actorRole: 'RECRUITER', action: 'RESUME_IMPORT', entityType: 'User', entityId: c.user.id, after: { file, skills: c.parsed.skills } },
      });
      rows.push(`ok    ${c.user.name.padEnd(24)} ${String(c.parsed.skills.length).padStart(2)} skills  → ${targets.map((t) => `${t.j.title} (${Math.round(t.m * 100)}%)`).join(', ')}${c.parsed.text ? '' : '  [scanned PDF, no text]'}`);
    }
    console.log(rows.join('\n'));
    console.log(`\nImported ${rows.filter((r) => r.startsWith('ok')).length}/${files.length} resumes. Candidate password: ${DEMO_PASSWORD}`);
  } finally {
    await prisma.$disconnect();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
