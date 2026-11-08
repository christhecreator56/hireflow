import './lib/env.js';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';
import { existsSync, readFileSync } from 'node:fs';
import { env } from './lib/env.js';
import { errorHandler, notFound } from './lib/http.js';
import { router as auth } from './routes/auth.js';
import { router as users } from './routes/users.js';
import { router as jobs, publicRouter, templatesRouter } from './routes/jobs.js';
import { router as candidate, applyRouter } from './routes/candidate.js';
import { router as applications, approvalsRouter } from './routes/applications.js';
import { router as interviews, scheduleRouter } from './routes/interviews.js';
import { router as reports } from './routes/reports.js';
import { router as admin } from './routes/admin.js';

export const app = express();
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: env.corsOrigin, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.get('/api/health', (_req, res) => res.json({ ok: true }));

const v1 = express.Router();
v1.use('/auth', auth);
v1.use('/public', publicRouter);
v1.use('/users', users);
v1.use('/jobs', applyRouter); // POST /jobs/:id/apply (candidate) — before the staff-only jobs router
v1.use('/jobs', jobs);
v1.use('/pipeline-templates', templatesRouter);
v1.use('/me', candidate);
v1.use('/applications', scheduleRouter); // POST /applications/:id/interviews
v1.use('/applications', applications);
v1.use('/approvals', approvalsRouter);
v1.use('/interviews', interviews);
v1.use('/reports', reports);
v1.use('/admin', admin);
app.use('/api/v1', v1);

const spec = new URL('../openapi.json', import.meta.url);
if (existsSync(spec)) {
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(JSON.parse(readFileSync(spec, 'utf8'))));
}

app.use((_req, _res) => {
  throw notFound('Route');
});
app.use(errorHandler);
