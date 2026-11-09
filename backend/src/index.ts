import cron from 'node-cron';
import { app } from './app.js';
import { env, missingConfig } from './lib/env.js';
import { prisma } from './lib/prisma.js';
import { ensureBucket } from './lib/storage.js';
import { runRetention } from './lib/governance.js';

// Long-running local server: refuse to start half-configured.
if (missingConfig.length) throw new Error(`Missing configuration: ${missingConfig.join(', ')}`);

await ensureBucket().catch((e) => console.warn('Object storage not ready:', e.message));

// Nightly retention sweep (USP H) for every org.
cron.schedule('0 2 * * *', async () => {
  for (const org of await prisma.organization.findMany()) {
    await runRetention(org.id).catch((e) => console.error('retention failed', org.id, e));
  }
});

app.listen(env.port, () => console.log(`API on http://localhost:${env.port}  docs: /api/docs`));
