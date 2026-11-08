# HireFlow: Recruitment & Applicant Tracking System

An applicant tracking system for publishing vacancies, collecting applications, moving candidates through **per-vacancy configurable pipelines with approval gates**, scheduling interviews with structured scorecards, sending templated notifications, and governing candidate data (consent, retention, export, erasure). Every write is audit-logged.

**Stack:** React + TypeScript + Tailwind (Vite) · Node.js + Express 5 + TypeScript · PostgreSQL 16 + Prisma · S3-compatible object storage (SeaweedFS locally) · Mailpit email sandbox · JWT httpOnly-cookie auth + RBAC · Vitest + Supertest · Docker Compose · GitHub Actions.

## Quick start (Docker, everything)

```bash
docker compose --profile app up -d --build
docker compose exec api npm run db:seed
```
Open http://localhost:5173. API docs: http://localhost:4000/api/docs. Email inbox: http://localhost:8025.

## Local development

```bash
docker compose up -d db storage mailpit      # infra only
cd backend && cp .env.example .env            # set JWT_SECRET
npm install && npx prisma migrate deploy && npm run db:seed
npm run dev                                   # API on :4000
cd ../frontend && npm install && npm run dev  # web on :5173 (proxies /api)
```

## Demo accounts (seeded; password `Password123!`)

| Role | Email |
|---|---|
| Employer (org admin) | employer@acme.test |
| Recruiter | recruiter@acme.test |
| Hiring Manager | manager@acme.test |
| Candidate | candidate@acme.test |

## Features

| Area | What it does |
|---|---|
| Job management | Create, publish, pause and close vacancies (enforced status machine), with skills, requirements and custom application questions. |
| Candidate portal | Sign up with consent, profile, resume upload (PDF/DOCX, 5 MB, stored in S3), apply, status timeline, withdraw. |
| Pipeline | Kanban per job. Drag to move, reject with a reason, full stage history. |
| **Configurable workflow (USP)** | Each vacancy owns its own stages. Each stage can notify the candidate with a chosen template and **require approval** from a role. Saved as reusable templates. No code change needed. |
| Interviews | Schedule with a panel, **double-booking prevention**, scorecards with per-job criteria (1–5) and a recommendation. |
| Communication | Handlebars templates (editable) → Mailpit sandbox, plus an email log and in-app notifications. |
| Reporting | KPIs, time-to-stage, source of applications, vacancy status, conversion funnel. Hiring managers are scoped to their own jobs. |
| **Data governance (USP)** | Consent capture (versioned, with IP), role-limited access (interviewers see masked PII, resume views audited), retention policy with a nightly cron and a manual run, self-service data export, and a deletion request → admin approval → anonymization that keeps analytics intact. |
| Audit | Append-only log of every write (actor, role, before/after, IP) with a viewer. |

## Project layout

```
backend/   Express API (src/routes, src/lib), prisma/ (schema, migrations, seed), tests/
frontend/  React app
docs/      WORKFLOW.md, TESTING.md, API.md, DATABASE.md (ER diagram), PHASES.md (bottleneck analysis)
```

## Tests

```bash
docker exec proeducateintern-db-1 createdb -U ats ats_test   # once
cd backend && npm test
cd frontend && npm test
```

## Security notes
- Passwords are hashed with bcrypt. The JWT sits in an httpOnly SameSite cookie (8 h). Login is rate-limited. helmet and a CORS allow-list are on.
- Zod validates every input. The candidate profile schema is `strict()`, so non-editable fields are rejected.
- All authorization goes through `backend/src/lib/access.ts`, which blocks IDOR. The hiring manager scope is enforced in SQL.
- Uploads are limited by MIME and size, and files are served only through 5-minute presigned URLs.
- There are no secrets in Git. `.env` is ignored and `.env.example` documents every variable.

See [docs/WORKFLOW.md](docs/WORKFLOW.md) (codebase workflow), [docs/TESTING.md](docs/TESTING.md) (test workflow), [docs/API.md](docs/API.md), [docs/DATABASE.md](docs/DATABASE.md) and [docs/PHASES.md](docs/PHASES.md).
