// Used by the Vercel build: load demo data into a brand-new database, never into one that has data.
// When file storage is configured, it also uploads any demo resume files that are still missing
// (e.g. the database was seeded before storage existed), so seeded resumes open on the live site.
import { PrismaClient } from '@prisma/client';
import { ensureBucket, objectExists, putObject, storageConfigured } from '../src/lib/storage.js';
import { fakeResumePdf } from './demo-pdf.js';

const prisma = new PrismaClient();
const orgs = await prisma.organization.count();

if (orgs === 0) {
  await prisma.$disconnect();
  process.env.SEED_FAKE = '1'; // generated candidates; real resumes are never in the repo
  await import('./seed.js');
} else {
  console.log('Database already has data: seed skipped');
  if (storageConfigured()) {
    await ensureBucket();
    const demo = await prisma.resume.findMany({
      where: { fileKey: { endsWith: '/seed.pdf' } },
      include: { candidate: { include: { user: { select: { name: true } } } } },
    });
    let uploaded = 0;
    for (const r of demo) {
      if (await objectExists(r.fileKey)) continue;
      await putObject(r.fileKey, fakeResumePdf(r.candidate.user.name, r.candidate.skills), 'application/pdf');
      uploaded++;
    }
    console.log(`Demo resume files: ${uploaded} uploaded, ${demo.length - uploaded} already present`);
  }
  await prisma.$disconnect();
}
