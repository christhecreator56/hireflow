# Build Phases & Bottleneck Analysis

## Bottlenecks seen in similar ATS projects, and the fix built in from day 1

| # | Bottleneck (seen in OpenCATS / typical PERN job portals) | Fix in this project |
|---|---|---|
| 1 | Candidate list does heavy `LEFT JOIN + DISTINCT + GROUP BY` per page. OpenCATS reported 10–18 s page loads at 50k candidates (346k rows examined to return 15). | Lean `select` for the Kanban (one query, no per-card lookups), composite index `Application(jobId, currentStageId)`, paginated audit and email logs. |
| 2 | Hard-coded pipeline stages, so every new workflow needs a code change. | `JobStage` rows per vacancy and `StageApproval` gates. The stage list is edited as data (USP G). |
| 3 | Analytics computed by loading rows into app memory. | All reports are single SQL aggregates (`COUNT FILTER`, `AVG(EXTRACT(EPOCH…))`) over the append-only `StageTransition` table. |
| 4 | Email sent inside the request, so a slow SMTP server stalls the UI. | Render → `EmailLog(QUEUED)` → send without awaiting → `SENT/FAILED`. The request returns at once. |
| 5 | Resumes streamed through the API server, which costs memory and bandwidth. | Uploads capped at 5 MB with MIME allow-list → S3. Downloads use 5-minute presigned URLs straight from storage. |
| 6 | IDOR: a candidate changes the URL id and sees another applicant. | One access module (`lib/access.ts`) used by every route, with tests that prove the 403s. |
| 7 | Lost updates when two recruiters drag the same card. | Optimistic lock: `updateMany where currentStageId = <read value>`. Zero rows → 409 "refresh and retry". |
| 8 | Interviewer double-booking. | Overlap check on every schedule/reschedule → 409 naming the busy interviewer. |
| 9 | Personal data kept forever. | Consent table, retention sweep (nightly cron and a manual button), and anonymization that keeps analytics rows intact (USP H). |
| 10 | External service dependency hanging a screen (OpenCATS SOAP call). | No third-party calls in request paths. Storage and email are local sandboxes in Docker. |

## Phases

1. **Scaffold**: git repo, docker-compose (Postgres 16, SeaweedFS S3, Mailpit), Prisma schema with 21 tables, migrations.
2. **Auth & RBAC**: bcrypt, 8 h JWT in an httpOnly cookie (Bearer also accepted), `requireRole`, a central access module, and an audit log on every write.
3. **Domain APIs**: jobs (status machine, questions, per-job stages and criteria), candidate portal, pipeline engine (approvals, optimistic lock), interviews (overlap check, scorecards), templated email, reports, governance (consent, export, deletion, retention).
4. **Frontend**: React + TS + Tailwind. Job board, candidate portal, staff dashboard, Kanban, workflow editor, interviews, approvals, governance, audit.
5. **Quality**: unit and integration tests (Vitest + Supertest on a separate test DB), OpenAPI and Swagger, DB docs with an ER diagram, CI.
6. **Ship**: Dockerfiles, README, demo video, report.
