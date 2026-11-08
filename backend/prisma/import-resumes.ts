/**
 * Bulk-import a folder of PDF resumes as candidates and apply them to matching published jobs.
 * Usage: npm run db:import-resumes -- <folder>   (default ../import/resumes)
 * Idempotent: a candidate whose email already exists is skipped.
 */
import '../src/lib/env.js';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { ensureBucket, putObject } from '../src/lib/storage.js';
import { nameFromFileName, parseResume } from '../src/lib/resumeParser.js';

const prisma = new PrismaClient();
const DEMO_PASSWORD = 'Password123!';
const dir = resolve(process.argv[2] ?? '../import/resumes');

const match = (have: string[], want: string[]) =>
  want.length ? want.filter((w) => have.some((h) => h.toLowerCase() === w.toLowerCase())).length / want.length : 0;

async function main() {
  await ensureBucket();
  const recruiter = await prisma.user.findFirst({ where: { role: 'RECRUITER' } });
  const jobs = await prisma.job.findMany({
    where: { status: 'PUBLISHED' },
    include: { stages: { orderBy: { order: 'asc' }, take: 1 } },
  });
  if (!recruiter || !jobs.length) throw new Error('Run the seed first: need a recruiter and published jobs');
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.pdf'));
  const rows: string[] = [];

  for (const file of files) {
    const buf = readFileSync(join(dir, file));
    const p = await parseResume(buf);
    const name = nameFromFileName(file);
    const email = p.email ?? `${name.toLowerCase().replace(/[^a-z]+/g, '.').replace(/^\.|\.$/g, '')}@resume-import.local`;
    if (await prisma.user.findUnique({ where: { email } })) {
      rows.push(`skip  ${name} (exists)`);
      continue;
    }

    const user = await prisma.user.create({
      data: {
        name,
        email,
        role: 'CANDIDATE',
        passwordHash: hash,
        profile: {
          create: { phone: p.phone, location: p.location, linkedin: p.linkedin, headline: p.headline ?? 'Computer Science student', skills: p.skills },
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

    // Apply to every published job with ≥25% skill overlap, else the single best fit.
    const ranked = jobs.map((j) => ({ j, m: match(p.skills, j.skills) })).sort((a, b) => b.m - a.m);
    const targets = ranked.filter((r) => r.m >= 0.25).length ? ranked.filter((r) => r.m >= 0.25) : ranked.slice(0, 1);
    for (const { j } of targets) {
      await prisma.application.create({
        data: {
          jobId: j.id,
          candidateId: profile.id,
          currentStageId: j.stages[0].id,
          resumeId: resume.id,
          source: 'OTHER',
          transitions: { create: { toStageId: j.stages[0].id, movedById: recruiter.id, note: 'Imported from resume batch' } },
        },
      });
    }
    await prisma.auditLog.create({
      data: { actorId: recruiter.id, actorRole: 'RECRUITER', action: 'RESUME_IMPORT', entityType: 'User', entityId: user.id, after: { file, skills: p.skills } },
    });
    rows.push(
      `ok    ${name.padEnd(24)} ${String(p.skills.length).padStart(2)} skills  → ${targets.map((t) => `${t.j.title} (${Math.round(t.m * 100)}%)`).join(', ')}${p.text ? '' : '  [no text layer: scanned PDF]'}`,
    );
  }
  console.log(rows.join('\n'));
  console.log(`\nImported ${rows.filter((r) => r.startsWith('ok')).length}/${files.length} resumes. Candidate password: ${DEMO_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
