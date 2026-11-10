// Used by the Vercel build: load demo data into a brand-new database, never into one that has data.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const orgs = await prisma.organization.count();
await prisma.$disconnect();
if (orgs === 0) {
  process.env.SEED_FAKE = '1'; // generated candidates; real resumes are never in the repo
  await import('./seed.js');
} else {
  console.log('Database already has data: seed skipped');
}
