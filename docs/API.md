# Recruitment & ATS API

Base URL: `http://localhost:4000/api/v1` (liveness probe: `GET http://localhost:4000/api/health`).
Interactive docs (Swagger UI): `http://localhost:4000/api/docs`, generated from `backend/openapi.json` (the server reads the file at start-up, so restart after editing it).

Roles: `EMPLOYER`, `RECRUITER`, `HIRING_MANAGER` (together "staff", scoped to one organization) and `CANDIDATE`.
"Staff" in the tables below means all three staff roles. A hiring manager only sees jobs (and their applications, approvals, reports) where they are the job's hiring manager.

## Authentication

- `POST /auth/login` verifies the password (bcrypt) and issues a JWT valid for **8 hours** (no refresh token; log in again afterwards).
- The JWT is set in an **httpOnly cookie named `token`** (`SameSite=Lax`, `Secure` when `COOKIE_SECURE=true`) and is also returned as `token` in the response body.
- Browsers: send the cookie automatically (`credentials: 'include'`; CORS origin is configured with `CORS_ORIGIN`).
- Scripts / other clients: send `Authorization: Bearer <token>`. If both are present the cookie wins.
- `POST /auth/logout` clears the cookie (the JWT itself is stateless and stays valid until expiry if you kept a copy).
- Login and register share a rate limit of 20 requests / 15 min / IP (429 `Too many login attempts, try again later`).
- Authorization is by role per route plus object-level checks (organization match, hiring-manager ownership, candidate owns the record). Foreign-organization objects return 404/403.

## Error format

Every error is JSON `{ "error": string, "details"?: any }`.

| Status | When | Example |
|---|---|---|
| 400 | zod validation failure or business rule | `{"error":"Validation failed","details":{"email":["Invalid email"]}}` ; `{"error":"Please answer all required questions","details":{"missing":["Notice period"]}}` |
| 401 | missing/invalid/expired token, bad login | `{"error":"Authentication required"}` |
| 403 | role not allowed or object out of scope | `{"error":"You do not have permission to do this"}` |
| 404 | not found (or belongs to another org) | `{"error":"Job not found"}` |
| 409 | duplicate, locked, stale state, double booking | `{"error":"Double booking: Harini Manager already has an interview at that time"}` |
| 429 | login/register rate limit | |
| 500 | unexpected | `{"error":"Internal server error"}` |

Prisma unique violation maps to 409 `Already exists`; missing record to 404 `Not found`.

## Pagination

Only two list endpoints paginate: `GET /admin/audit-logs` and `GET /admin/email-logs`.

| Param | Default | Notes |
|---|---|---|
| `page` | 1 | 1-based |
| `pageSize` | 20 | clamped to 1..100 |

`audit-logs` returns `{ page, pageSize, total, items: [...] }`; `email-logs` returns a bare array. Other lists are unpaginated (jobs, users) or capped (public jobs: 100, kanban cards: 500, candidate notifications: 50).

## Endpoints

### Auth

| Method | Path | Roles | Description |
|---|---|---|---|
| POST | /auth/register | public | Candidate sign-up (requires `consent: true`, optional `talentPoolConsent`); sets cookie |
| POST | /auth/login | public | Log in; sets cookie, returns `{user, token}` |
| POST | /auth/logout | public | Clear cookie (204) |
| GET | /auth/me | any authenticated | Current user + organization |

### Public

| Method | Path | Roles | Description |
|---|---|---|---|
| GET | /public/jobs | public | Search PUBLISHED jobs (`q`, `location`, `type`, `skill`), max 100 |
| GET | /public/jobs/{id} | public | Published job detail with application questions |
| GET | /api/health | public | Liveness (`{ok:true}`), outside `/api/v1` |

### Users

| Method | Path | Roles | Description |
|---|---|---|---|
| GET | /users | staff | List users of my org |
| POST | /users | EMPLOYER | Create staff user (`name,email,role,password>=8`) |
| PATCH | /users/{id} | EMPLOYER | Change `role` / `isActive` |

### Jobs

| Method | Path | Roles | Description |
|---|---|---|---|
| GET | /jobs | staff | List org jobs (`?status=`); HM sees only own |
| POST | /jobs | EMPLOYER, RECRUITER | Create DRAFT job with questions, pipeline (stages / template / default) and criteria |
| GET | /jobs/{id} | staff | Detail incl. stages with card counts, questions, criteria |
| PATCH | /jobs/{id} | EMPLOYER, RECRUITER | Update fields |
| POST | /jobs/{id}/status | EMPLOYER, RECRUITER | `DRAFT->PUBLISHED/CLOSED`, `PUBLISHED->PAUSED/CLOSED`, `PAUSED->PUBLISHED/CLOSED`; else 409 |
| PUT | /jobs/{id}/questions | EMPLOYER, RECRUITER | Replace questions (array body); 409 once anyone applied |
| PUT | /jobs/{id}/stages | EMPLOYER, RECRUITER | Replace the vacancy pipeline (array body); cannot drop a stage holding candidates |
| PUT | /jobs/{id}/criteria | EMPLOYER, RECRUITER | Replace scorecard criteria (array of names) |
| GET | /jobs/{id}/applications | staff | Kanban cards (max 500) |
| POST | /jobs/{id}/apply | CANDIDATE | Apply to a PUBLISHED job (see Candidate) |

### Pipeline templates

| Method | Path | Roles | Description |
|---|---|---|---|
| GET | /pipeline-templates | staff | List org templates |
| POST | /pipeline-templates | EMPLOYER, RECRUITER | Create template `{name, stages[]}` |

### Candidate (`/me`, CANDIDATE only)

| Method | Path | Roles | Description |
|---|---|---|---|
| GET | /me/profile | CANDIDATE | Profile + resumes |
| PATCH | /me/profile | CANDIDATE | Edit name, phone, location, linkedin, headline, skills, experienceYears (unknown keys rejected) |
| POST | /me/resumes | CANDIDATE | Upload PDF/DOCX (multipart field `file`, max 5 MB) |
| GET | /me/resumes | CANDIDATE | List my resumes |
| GET | /me/resumes/{id}/url | CANDIDATE | Signed download URL |
| POST | /jobs/{id}/apply | CANDIDATE | Apply `{resumeId?, source?, answers{questionId: value}}` |
| GET | /me/applications | CANDIDATE | My applications with `statusLabel` and `timeline` (internal stage names hidden) |
| POST | /me/applications/{id}/withdraw | CANDIDATE | Withdraw an ACTIVE application |
| GET | /me/notifications | CANDIDATE | Latest 50 |
| POST | /me/notifications/read | CANDIDATE | Mark all read (204) |
| GET | /me/consents | CANDIDATE | Consent history |
| POST | /me/consents | CANDIDATE | Grant/withdraw `TALENT_POOL` or `MARKETING` |
| GET | /me/export | CANDIDATE | Download all my data (`my-data.json`) |
| GET | /me/data-requests | CANDIDATE | My deletion requests |
| POST | /me/data-requests | CANDIDATE | Request deletion (409 if one is pending) |

### Applications

| Method | Path | Roles | Description |
|---|---|---|---|
| GET | /applications/{id} | staff (job in scope) | Full detail: answers, history, approvals, interviews+scorecards, notes, emails |
| POST | /applications/{id}/move | staff (job in scope) | `{toStageId, note?}`; **200** `{moved:true,application}` or **202** `{moved:false,approvalId}` when the stage needs approval |
| POST | /applications/{id}/reject | staff (job in scope) | `{reason}` (3..500); moves to the REJECTED stage |
| POST | /applications/{id}/notes | staff (job in scope) | Add internal note (1..2000) |
| POST | /applications/{id}/email | EMPLOYER, RECRUITER | Send org template `{templateKey}` (202) |
| GET | /applications/resumes/{resumeId}/url | staff (job in scope) | Signed resume URL, audited as VIEW_RESUME |
| POST | /applications/{id}/interviews | staff (job in scope) | Schedule interview (see Interviews) |

### Approvals

| Method | Path | Roles | Description |
|---|---|---|---|
| GET | /approvals | staff | `?status=PENDING\|APPROVED\|REJECTED` (default PENDING); non-employers see only their approver role |
| POST | /approvals/{id}/decide | configured approver role, EMPLOYER | `{approve, comment?}`; approve performs the move; 409 if already decided |

### Interviews

| Method | Path | Roles | Description |
|---|---|---|---|
| POST | /applications/{id}/interviews | staff (job in scope) | `{title?, scheduledAt (future), durationMin 15..480, mode, locationOrLink?, interviewerIds[]}`; 409 on double booking |
| GET | /interviews/mine | staff | My panel interviews, candidate email/phone masked |
| PATCH | /interviews/{id} | staff (job in scope) | Reschedule / edit / `status` SCHEDULED, COMPLETED, CANCELLED |
| POST | /interviews/{id}/scorecards | staff on the panel | `{ratings{criterion:1..5}, comments?, recommendation}`; ratings must cover exactly the job criteria; one per interviewer (resubmit updates) |

### Reports

All accept `?jobId=&from=&to=` (ISO dates, filter on `appliedAt`) except `vacancies`.

| Method | Path | Roles | Description |
|---|---|---|---|
| GET | /reports/overview | staff | total / active / hired / rejected / last7Days / upcomingInterviews |
| GET | /reports/time-to-stage | staff | Avg days from application to each stage |
| GET | /reports/sources | staff | Applications and hires per source |
| GET | /reports/vacancies | staff | Job counts by status |
| GET | /reports/funnel | staff | Share of applicants that ever reached each stage |

### Admin / Governance

| Method | Path | Roles | Description |
|---|---|---|---|
| GET | /admin/org | EMPLOYER, RECRUITER | Organization settings |
| PATCH | /admin/org | EMPLOYER | `name`, `retentionDays` (30..3650) |
| POST | /admin/retention/run | EMPLOYER | Anonymize candidates past retention now |
| GET | /admin/data-requests | EMPLOYER | All data requests |
| POST | /admin/data-requests/{id}/decide | EMPLOYER | `{approve}`; approve anonymizes the candidate |
| GET | /admin/audit-logs | EMPLOYER, RECRUITER | Filters `entityType, entityId, actorId, action`, paginated |
| GET | /admin/email-templates | staff | Org email templates |
| PUT | /admin/email-templates/{key} | EMPLOYER, RECRUITER | Upsert `{name, subject, bodyHtml}`; key `^[a-z_]{3,40}$` |
| GET | /admin/email-logs | EMPLOYER, RECRUITER | Delivery log, paginated |

Total: 61 endpoints under `/api/v1` (+ `/api/health`). `POST /jobs/{id}/apply` and `POST /applications/{id}/interviews` are listed under two areas but are one endpoint each.

## curl examples

Demo account (seeded test credentials): `recruiter@acme.test` / `Password123!`.

```bash
# 1. Login (stores the httpOnly cookie in cookies.txt, prints the JWT too)
curl -s -c cookies.txt -X POST http://localhost:4000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"recruiter@acme.test","password":"Password123!"}'

# Bearer alternative: TOKEN=$(curl -s ... | node -pe "JSON.parse(require('fs').readFileSync(0)).token")
# curl -H "Authorization: Bearer $TOKEN" http://localhost:4000/api/v1/auth/me

# 2. List jobs and pick one
curl -s -b cookies.txt "http://localhost:4000/api/v1/jobs?status=PUBLISHED"

# 3. Create a job with a custom approval-gated pipeline (starts as DRAFT)
curl -s -b cookies.txt -X POST http://localhost:4000/api/v1/jobs \
  -H 'Content-Type: application/json' \
  -d '{"title":"Backend Engineer","description":"Build and run our ATS services.","skills":["Node.js"],
       "stages":[{"name":"Applied"},{"name":"Interview"},
                 {"name":"Offer","requiresApproval":true,"approverRole":"EMPLOYER"},
                 {"name":"Hired","category":"HIRED"},{"name":"Rejected","category":"REJECTED"}]}'

# 4. Publish it
curl -s -b cookies.txt -X POST http://localhost:4000/api/v1/jobs/JOB_ID/status \
  -H 'Content-Type: application/json' -d '{"status":"PUBLISHED"}'

# 5. Move a candidate (200 moved, or 202 {"moved":false,"approvalId":...} for a gated stage)
curl -s -i -b cookies.txt -X POST http://localhost:4000/api/v1/applications/APP_ID/move \
  -H 'Content-Type: application/json' -d '{"toStageId":"STAGE_ID","note":"Passed screening"}'

# 6. Schedule an interview (409 if any interviewer already has an overlapping one)
curl -s -b cookies.txt -X POST http://localhost:4000/api/v1/applications/APP_ID/interviews \
  -H 'Content-Type: application/json' \
  -d '{"scheduledAt":"2026-12-01T10:00:00Z","durationMin":60,"mode":"ONLINE","interviewerIds":["USER_ID"]}'

# 7. Funnel analytics for one job
curl -s -b cookies.txt "http://localhost:4000/api/v1/reports/funnel?jobId=JOB_ID"
```

## Known limitations

- `/reports/funnel` and `/reports/time-to-stage` group by stage **name**. Org-wide results merge pipelines whose stages share an order. Pass `jobId` to see a single pipeline.
- `POST /interviews/{id}/scorecards` is an upsert and returns 201 for both create and update.
