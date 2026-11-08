import cron from 'node-cron';
import { app } from './app.js';
import { env } from './lib/env.js';
import { prisma } from './lib/prisma.js';
import { ensureBucket } from './lib/storage.js';
import { runRetention } from './lib/governance.js';

await ensureBucket().catch((e) => console.warn('Object storage not ready:', e.message));

// Nightly retention sweep (USP H) for every org.
cron.schedule('0 2 * * *', async () => {
  for (const org of await prisma.organization.findMany()) {
    await runRetention(org.id).catch((e) => console.error('retention failed', org.id, e));
  }
});

app.listen(env.port, () => console.log(`API on http://localhost:${env.port}  docs: /api/docs`));
