import '../src/lib/env.js';
import bcrypt from 'bcryptjs';
import { PrismaClient, type Role } from '@prisma/client';
import { DEFAULT_CRITERIA, DEFAULT_STAGES, stageData } from '../src/lib/pipeline.js';
import { ensureBucket, putObject } from '../src/lib/storage.js';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { resumeFiles } from './import-resumes.js';
import { seedFromResumes } from './resume-pipeline.js';

const prisma = new PrismaClient();
// Demo-only password shared by every seeded account (documented in README).
const DEMO_PASSWORD = 'Password123!';
const DAY = 24 * 60 * 60_000;
const ago = (days: number) => new Date(Date.now() - days * DAY);

/** Tiny valid one-page PDF so resume preview works without real files. */
function fakeResumePdf(name: string, skills: string[]) {
  const text = `(${name} - Resume) Tj 0 -24 Td (Skills: ${skills.join(', ')}) Tj`;
  const stream = `BT /F1 18 Tf 72 720 Td ${text} ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}

const TEMPLATES = [
  ['application_received', 'Application received', 'We received your application for {{jobTitle}}',
    '<p>Hi {{candidateName}},</p><p>Thanks for applying for <b>{{jobTitle}}</b> at {{companyName}}. Our team will review your profile and get back to you.</p>'],
  ['stage_changed', 'Stage update', 'Update on your {{jobTitle}} application',
    '<p>Hi {{candidateName}},</p><p>Good news: your application for <b>{{jobTitle}}</b> has moved to <b>{{stageName}}</b>.</p>'],
  ['interview_scheduled', 'Interview scheduled', 'Interview scheduled: {{jobTitle}}',
    '<p>Hi {{candidateName}},</p><p>Your <b>{{interviewTitle}}</b> for {{jobTitle}} is on <b>{{interviewDate}}</b> ({{durationMin}} min).</p><p>Where: {{location}}</p>'],
  ['offer', 'Offer', 'An offer from {{companyName}}',
    '<p>Hi {{candidateName}},</p><p>We are delighted to move forward with an offer for <b>{{jobTitle}}</b>. Our recruiter will contact you with details.</p>'],
  ['hired', 'Welcome aboard', 'Welcome to {{companyName}}!',
    '<p>Hi {{candidateName}},</p><p>Congratulations on joining as <b>{{jobTitle}}</b>!</p>'],
  ['rejected', 'Rejection', 'Your application for {{jobTitle}}',
    '<p>Hi {{candidateName}},</p><p>Thank you for your interest in {{jobTitle}}. After careful consideration we will not be moving forward at this time. We wish you the best.</p>'],
] as const;

const FIRST = ['Aarav', 'Diya', 'Rohan', 'Ananya', 'Vikram', 'Meera', 'Karthik', 'Priya', 'Arjun', 'Sneha', 'Rahul', 'Kavya',
  'Aditya', 'Ishita', 'Nikhil', 'Pooja', 'Siddharth', 'Neha', 'Varun', 'Riya', 'Harish', 'Lakshmi', 'Manoj', 'Tara', 'Gokul', 'Divya'];
const LAST = ['Sharma', 'Iyer', 'Reddy', 'Nair', 'Patel', 'Menon', 'Kumar', 'Rao', 'Singh', 'Das'];
const SOURCES = ['LINKEDIN', 'REFERRAL', 'JOB_BOARD', 'WEBSITE', 'LINKEDIN', 'JOB_BOARD'];
const SKILLS = ['React', 'TypeScript', 'Node.js', 'PostgreSQL', 'Python', 'Docker', 'AWS', 'Figma', 'SQL', 'Java', 'Go', 'Tailwind'];

async function main() {
  console.log('Resetting database…');
  await prisma.$transaction([
    prisma.auditLog.deleteMany(), prisma.emailLog.deleteMany(), prisma.notification.deleteMany(),
    prisma.dataRequest.deleteMany(), prisma.scorecard.deleteMany(), prisma.interviewPanel.deleteMany(),
    prisma.interview.deleteMany(), prisma.stageApproval.deleteMany(), prisma.stageTransition.deleteMany(),
    prisma.note.deleteMany(), prisma.applicationAnswer.deleteMany(), prisma.application.deleteMany(),
    prisma.resume.deleteMany(), prisma.consent.deleteMany(), prisma.candidateProfile.deleteMany(),
    prisma.jobQuestion.deleteMany(), prisma.scorecardCriterion.deleteMany(), prisma.jobStage.deleteMany(),
    prisma.job.deleteMany(), prisma.pipelineTemplate.deleteMany(), prisma.emailTemplate.deleteMany(),
    prisma.user.deleteMany(), prisma.organization.deleteMany(),
  ]);
  await ensureBucket();
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const org = await prisma.organization.create({ data: { name: 'Acme Technologies', retentionDays: 180 } });
  const staff = async (name: string, email: string, role: Role) =>
    prisma.user.create({ data: { name, email, role, orgId: org.id, passwordHash: hash } });
  const employer = await staff('Esha Employer', 'employer@acme.test', 'EMPLOYER');
  const recruiter = await staff('Rahul Recruiter', 'recruiter@acme.test', 'RECRUITER');
  const recruiter2 = await staff('Ritu Recruiter', 'recruiter2@acme.test', 'RECRUITER');
  const hm = await staff('Harini Manager', 'manager@acme.test', 'HIRING_MANAGER');
  const hm2 = await staff('Mohan Manager', 'manager2@acme.test', 'HIRING_MANAGER');

  await prisma.emailTemplate.createMany({
    data: TEMPLATES.map(([key, name, subject, bodyHtml]) => ({ orgId: org.id, key, name, subject, bodyHtml })),
  });

  // A lean custom pipeline (USP G) saved as a reusable template.
  const internStages = [
    { name: 'Applied' },
    { name: 'Online Test', notifyCandidate: true, emailTemplateKey: 'stage_changed' },
    { name: 'Tech Interview', notifyCandidate: true, emailTemplateKey: 'stage_changed' },
    { name: 'Offer', notifyCandidate: true, emailTemplateKey: 'offer', requiresApproval: true, approverRole: 'EMPLOYER' as Role },
    { name: 'Hired', category: 'HIRED' as const, notifyCandidate: true, emailTemplateKey: 'hired' },
    { name: 'Rejected', category: 'REJECTED' as const, notifyCandidate: true, emailTemplateKey: 'rejected' },
  ];
  await prisma.pipelineTemplate.create({ data: { orgId: org.id, name: 'Internship (lean)', stages: internStages } });
  await prisma.pipelineTemplate.create({ data: { orgId: org.id, name: 'Standard hiring', stages: DEFAULT_STAGES } });

  const jobDefs = [
    { title: 'Senior Full Stack Engineer', department: 'Engineering', location: 'Chennai', employmentType: 'FULL_TIME', salaryMin: 1800000, salaryMax: 2800000,
      skills: ['React', 'TypeScript', 'Node.js', 'PostgreSQL'], status: 'PUBLISHED', hm: hm, stages: DEFAULT_STAGES, age: 40 },
    { title: 'Frontend Developer Intern', department: 'Engineering', location: 'Remote', employmentType: 'INTERNSHIP', salaryMin: 25000, salaryMax: 40000,
      skills: ['React', 'Tailwind', 'TypeScript'], status: 'PUBLISHED', hm: hm, stages: internStages, age: 25 },
    { title: 'Product Designer', department: 'Design', location: 'Bengaluru', employmentType: 'FULL_TIME', salaryMin: 1200000, salaryMax: 1800000,
      skills: ['Figma', 'UX Research'], status: 'PAUSED', hm: hm2, stages: DEFAULT_STAGES, age: 30 },
    { title: 'Data Analyst', department: 'Analytics', location: 'Hyderabad', employmentType: 'FULL_TIME', salaryMin: 900000, salaryMax: 1400000,
      skills: ['SQL', 'Python'], status: 'CLOSED', hm: hm2, stages: DEFAULT_STAGES, age: 60 },
    { title: 'DevOps Engineer', department: 'Platform', location: 'Chennai', employmentType: 'FULL_TIME', salaryMin: 1500000, salaryMax: 2400000,
      skills: ['Docker', 'AWS', 'Kubernetes'], status: 'DRAFT', hm: hm, stages: DEFAULT_STAGES, age: 2 },
    { title: 'Backend Developer Intern', department: 'Engineering', location: 'Chennai', employmentType: 'INTERNSHIP', salaryMin: 25000, salaryMax: 40000,
      skills: ['Python', 'Java', 'SQL', 'REST APIs'], status: 'PUBLISHED', hm: hm2, stages: internStages, age: 32 },
    { title: 'ML Engineer Intern', department: 'AI Research', location: 'Chennai', employmentType: 'INTERNSHIP', salaryMin: 30000, salaryMax: 45000,
      skills: ['Python', 'Machine Learning', 'Pandas', 'SQL'], status: 'PUBLISHED', hm: hm2, stages: DEFAULT_STAGES, age: 30 },
  ] as const;

  const jobs = [];
  for (const d of jobDefs) {
    const job = await prisma.job.create({
      data: {
        orgId: org.id, title: d.title, department: d.department, location: d.location, employmentType: d.employmentType,
        salaryMin: d.salaryMin, salaryMax: d.salaryMax, skills: [...d.skills], status: d.status,
        description: `We are looking for a ${d.title} to join our ${d.department} team. You will build and ship features end to end, collaborate with product and design, and help raise the quality bar.`,
        requirements: `- Strong fundamentals in ${d.skills.join(', ')}\n- Clear communication\n- Ownership mindset`,
        hiringManagerId: d.hm.id, createdById: recruiter.id,
        publishedAt: d.status === 'DRAFT' ? null : ago(d.age), closedAt: d.status === 'CLOSED' ? ago(5) : null,
        createdAt: ago(d.age + 2),
        questions: {
          create: [
            { label: 'Why do you want to join Acme?', type: 'LONG_TEXT', required: true, order: 0 },
            { label: 'Notice period', type: 'SINGLE_CHOICE', options: ['Immediate', '15 days', '30 days', '60+ days'], required: true, order: 1 },
            { label: 'Are you open to relocation?', type: 'YES_NO', required: false, order: 2 },
          ],
        },
        stages: { create: d.stages.map((s, i) => stageData(s, i)) },
        criteria: { create: DEFAULT_CRITERIA.map((name, i) => ({ name, order: i })) },
      },
      include: { stages: { orderBy: { order: 'asc' } }, questions: { orderBy: { order: 'asc' } } },
    });
    jobs.push({ ...job, age: d.age });
  }

  // Real resumes (gitignored ../import/resumes) replace the generated candidates when present.
  const resumeDir = resolve(process.env.RESUMES_DIR ?? '../import/resumes');
  if (!process.env.SEED_FAKE && existsSync(resumeDir) && resumeFiles(resumeDir).length) {
    console.log(`Building candidates from real resumes in ${resumeDir}…`);
    await seedFromResumes(prisma, {
      dir: resumeDir,
      jobs: jobs.filter((j) => j.status === 'PUBLISHED'),
      recruiters: [recruiter, recruiter2],
      employer,
      passwordHash: hash,
    });
    await prisma.auditLog.createMany({
      data: jobs.map((j) => ({ actorId: recruiter.id, actorRole: 'RECRUITER', action: 'CREATE', entityType: 'Job', entityId: j.id, createdAt: j.createdAt })),
    });
    console.log('Seed complete', {
      users: await prisma.user.count(), jobs: await prisma.job.count(), applications: await prisma.application.count(),
      interviews: await prisma.interview.count(), scorecards: await prisma.scorecard.count(),
    });
    console.log(`Logins (password ${DEMO_PASSWORD}): employer@acme.test, recruiter@acme.test, manager@acme.test, manager2@acme.test, candidate@acme.test; every candidate can also log in with the email on their resume`);
    return;
  }

  // Candidates
  console.log('Creating candidates + resumes…');
  const candidates = [];
  for (let i = 0; i < FIRST.length; i++) {
    const name = `${FIRST[i]} ${LAST[i % LAST.length]}`;
    const skills = [SKILLS[i % SKILLS.length], SKILLS[(i + 3) % SKILLS.length], SKILLS[(i + 7) % SKILLS.length]];
    const email = i === 0 ? 'candidate@acme.test' : `${FIRST[i].toLowerCase()}.${LAST[i % LAST.length].toLowerCase()}@example.com`;
    const user = await prisma.user.create({
      data: {
        name, email, role: 'CANDIDATE', passwordHash: hash, createdAt: ago(45),
        profile: {
          create: {
            phone: `+91 98${String(40000000 + i * 1234567).slice(0, 8)}`, location: ['Chennai', 'Bengaluru', 'Hyderabad', 'Pune', 'Remote'][i % 5],
            headline: `${skills[0]} developer`, skills, experienceYears: (i % 8) + 1, linkedin: `https://linkedin.com/in/${FIRST[i].toLowerCase()}`,
          },
        },
        consents: { create: { type: 'DATA_PROCESSING', policyVersion: '2026-11', granted: true, createdAt: ago(45) } },
      },
      include: { profile: true },
    });
    const key = `resumes/${user.profile!.id}/seed.pdf`;
    await putObject(key, fakeResumePdf(name, skills), 'application/pdf');
    const resume = await prisma.resume.create({
      data: { candidateId: user.profile!.id, fileKey: key, fileName: `${name.replace(' ', '_')}_Resume.pdf`, mimeType: 'application/pdf', size: 900 },
    });
    candidates.push({ user, profile: user.profile!, resume });
  }

  // Applications spread across stages with realistic, back-dated history (feeds analytics).
  console.log('Creating applications, transitions, interviews…');
  // [jobIndex, how far down the pipeline (index into active stages), terminal?]
  const plan: [number, number, 'REJECTED' | 'HIRED' | null][] = [];
  const reach0 = [0, 0, 1, 1, 1, 2, 2, 3, 3, 4, 4, 5, 1, 2, 3, 0, 1, 2]; // job 0
  reach0.forEach((r, i) => plan.push([0, r, r === 5 ? 'HIRED' : i % 5 === 4 ? 'REJECTED' : null]));
  [0, 1, 1, 2, 2, 3, 0, 1].forEach((r, i) => plan.push([1, r, i === 7 ? 'REJECTED' : null]));
  [0, 1, 2, 3].forEach((r) => plan.push([2, r, null]));
  [1, 2, 3, 5, 5, 1].forEach((r, i) => plan.push([3, r, r === 5 ? 'HIRED' : 'REJECTED']));

  const used = new Set<string>();
  let ci = 0;
  for (const [jIdx, reach, terminal] of plan) {
    const job = jobs[jIdx];
    let c = candidates[ci % candidates.length];
    while (used.has(`${job.id}:${c.profile.id}`)) c = candidates[++ci % candidates.length];
    used.add(`${job.id}:${c.profile.id}`);
    ci++;

    const active = job.stages.filter((s) => s.category === 'ACTIVE');
    const hired = job.stages.find((s) => s.category === 'HIRED')!;
    const rejected = job.stages.find((s) => s.category === 'REJECTED')!;
    const path = active.slice(0, Math.min(reach, active.length - 1) + 1);
    if (terminal === 'HIRED') path.push(...active.slice(path.length), hired);
    if (terminal === 'REJECTED') path.push(rejected);

    const appliedAt = ago(Math.max(job.age - (ci % 10), 3));
    const span = Date.now() - appliedAt.getTime() - DAY;
    const step = span / (path.length + 1);
    const final = path[path.length - 1];
    const app = await prisma.application.create({
      data: {
        jobId: job.id, candidateId: c.profile.id, currentStageId: final.id, resumeId: c.resume.id,
        source: SOURCES[ci % SOURCES.length], appliedAt,
        status: terminal ?? 'ACTIVE', rejectionReason: terminal === 'REJECTED' ? 'Skills not a match for current needs' : null,
        answers: {
          create: [
            { questionId: job.questions[0].id, value: `I love building products and Acme's engineering culture stands out to me.` },
            { questionId: job.questions[1].id, value: ['Immediate', '15 days', '30 days', '60+ days'][ci % 4] },
            { questionId: job.questions[2].id, value: ci % 2 === 0 },
          ],
        },
      },
    });
    let prev: string | null = null;
    for (let s = 0; s < path.length; s++) {
      await prisma.stageTransition.create({
        data: {
          applicationId: app.id, fromStageId: prev, toStageId: path[s].id, movedById: s === 0 ? c.user.id : recruiter.id,
          createdAt: s === 0 ? appliedAt : new Date(appliedAt.getTime() + step * s), note: s === 0 ? 'Applied' : undefined,
        },
      });
      prev = path[s].id;
    }

    // Interviews for anyone who reached an interview-like stage.
    if (path.some((s) => /interview/i.test(s.name))) {
      const past = terminal !== null || final.name === 'Offer';
      const when = past ? new Date(appliedAt.getTime() + step * 2.5) : new Date(Date.now() + ((ci % 5) + 1) * DAY + (ci % 3) * 3 * 60 * 60_000);
      when.setMinutes(0, 0, 0);
      when.setHours(10 + (ci % 6));
      const iv = await prisma.interview.create({
        data: {
          applicationId: app.id, title: 'Technical Interview', scheduledAt: when, durationMin: 60, mode: ci % 2 ? 'ONLINE' : 'ONSITE',
          locationOrLink: ci % 2 ? 'https://meet.example.com/acme-tech' : 'Acme HQ, Chennai - Room 4B',
          status: past ? 'COMPLETED' : 'SCHEDULED',
          panel: { create: [{ userId: job.hiringManagerId! }, { userId: ci % 2 ? recruiter.id : recruiter2.id }] },
        },
      });
      if (past) {
        for (const interviewerId of [job.hiringManagerId!, ci % 2 ? recruiter.id : recruiter2.id]) {
          const base = terminal === 'REJECTED' ? 2 : 4;
          await prisma.scorecard.create({
            data: {
              interviewId: iv.id, interviewerId,
              ratings: Object.fromEntries(DEFAULT_CRITERIA.map((k, i) => [k, Math.min(5, Math.max(1, base + ((i + ci) % 2)))])),
              comments: terminal === 'REJECTED' ? 'Fundamentals need more depth.' : 'Strong problem solver, communicates clearly.',
              recommendation: terminal === 'REJECTED' ? 'NO' : 'YES',
              submittedAt: new Date(when.getTime() + 2 * 60 * 60_000),
            },
          });
        }
      }
    }
  }

  // One candidate waiting at the Offer approval gate for the demo.
  const gateApp = await prisma.application.findFirst({
    where: { jobId: jobs[0].id, status: 'ACTIVE', currentStage: { name: 'Interview' } },
  });
  if (gateApp) {
    const offer = jobs[0].stages.find((s) => s.name === 'Offer')!;
    await prisma.stageApproval.create({
      data: { applicationId: gateApp.id, targetStageId: offer.id, requestedById: recruiter.id, comment: 'Great interviews, recommend offer' },
    });
  }

  // A pending deletion request for the governance demo.
  const leaver = candidates[candidates.length - 1];
  await prisma.dataRequest.create({ data: { userId: leaver.user.id, type: 'DELETE', reason: 'I accepted another offer, please delete my data.' } });

  await prisma.auditLog.createMany({
    data: [
      { actorId: employer.id, actorRole: 'EMPLOYER', action: 'SEED', entityType: 'Organization', entityId: org.id, createdAt: ago(46) },
      ...jobs.map((j) => ({ actorId: recruiter.id, actorRole: 'RECRUITER', action: 'CREATE', entityType: 'Job', entityId: j.id, createdAt: j.createdAt })),
    ],
  });

  const counts = {
    users: await prisma.user.count(), jobs: await prisma.job.count(), applications: await prisma.application.count(),
    interviews: await prisma.interview.count(), scorecards: await prisma.scorecard.count(),
  };
  console.log('Seed complete', counts);
  console.log(`Logins (password ${DEMO_PASSWORD}): employer@acme.test, recruiter@acme.test, manager@acme.test, candidate@acme.test`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
