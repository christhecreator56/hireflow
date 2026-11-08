import { describe, expect, it } from 'vitest';
import { canSeeApplication, canSeeJob, canTransitionJob, maskPII } from '../src/lib/access.js';
import { canApprove, overlaps, validateStages, DEFAULT_STAGES } from '../src/lib/pipeline.js';
import { render } from '../src/lib/mailer.js';
import type { AuthUser } from '../src/lib/auth.js';

const u = (role: AuthUser['role'], id = 'u1', orgId: string | null = 'o1'): AuthUser => ({ id, role, orgId, name: 'n', email: 'e@x.y' });

describe('canTransitionJob', () => {
  it('allows legal moves', () => {
    expect(canTransitionJob('DRAFT', 'PUBLISHED')).toBe(true);
    expect(canTransitionJob('PUBLISHED', 'PAUSED')).toBe(true);
    expect(canTransitionJob('PAUSED', 'PUBLISHED')).toBe(true);
    expect(canTransitionJob('PUBLISHED', 'CLOSED')).toBe(true);
  });
  it('rejects illegal moves', () => {
    expect(canTransitionJob('CLOSED', 'PUBLISHED')).toBe(false);
    expect(canTransitionJob('CLOSED', 'DRAFT')).toBe(false);
    expect(canTransitionJob('PUBLISHED', 'DRAFT')).toBe(false);
    expect(canTransitionJob('DRAFT', 'PAUSED')).toBe(false);
  });
});

describe('canSeeJob / canSeeApplication', () => {
  const job = { orgId: 'o1', hiringManagerId: 'hm1' };
  it('candidates never see staff job view', () => expect(canSeeJob(u('CANDIDATE'), job)).toBe(false));
  it('other org is blocked', () => expect(canSeeJob(u('EMPLOYER', 'e', 'o2'), job)).toBe(false));
  it('employer and recruiter in org can see', () => {
    expect(canSeeJob(u('EMPLOYER'), job)).toBe(true);
    expect(canSeeJob(u('RECRUITER'), job)).toBe(true);
  });
  it('hiring manager only sees own jobs', () => {
    expect(canSeeJob(u('HIRING_MANAGER', 'hm1'), job)).toBe(true);
    expect(canSeeJob(u('HIRING_MANAGER', 'hm2'), job)).toBe(false);
  });
  it('candidate sees only own application', () => {
    const a = { job, candidate: { userId: 'c1' } };
    expect(canSeeApplication(u('CANDIDATE', 'c1', null), a)).toBe(true);
    expect(canSeeApplication(u('CANDIDATE', 'c2', null), a)).toBe(false);
    expect(canSeeApplication(u('RECRUITER'), a)).toBe(true);
    expect(canSeeApplication(u('HIRING_MANAGER', 'hm2'), a)).toBe(false);
  });
});

describe('maskPII', () => {
  it('masks email and phone', () => {
    const m = maskPII({ email: 'alice@example.com', phone: '+919876543210' });
    expect(m.email).toBe('a***@example.com');
    expect(m.phone).toMatch(/^\*+10$/);
    expect(m.phone).not.toContain('9876');
  });
  it('keeps nulls', () => {
    expect(maskPII({ email: null, phone: null })).toEqual({ email: null, phone: null });
  });
});

describe('validateStages', () => {
  it('accepts the default pipeline', () => expect(() => validateStages(DEFAULT_STAGES)).not.toThrow());
  it('needs a Rejected stage', () => {
    expect(() => validateStages([{ name: 'A' }, { name: 'B', category: 'HIRED' }])).toThrow(/Rejected/);
  });
  it('needs unique names (case-insensitive)', () => {
    expect(() => validateStages([{ name: 'A' }, { name: 'a' }, { name: 'R', category: 'REJECTED' }])).toThrow(/unique/);
  });
  it('requiresApproval needs approver role', () => {
    expect(() => validateStages([{ name: 'A' }, { name: 'B', requiresApproval: true }, { name: 'R', category: 'REJECTED' }])).toThrow(/approver/);
  });
  it('needs at least 2 stages and an active first stage', () => {
    expect(() => validateStages([{ name: 'R', category: 'REJECTED' }])).toThrow();
    expect(() => validateStages([{ name: 'R', category: 'REJECTED' }, { name: 'A' }])).toThrow(/First stage/);
  });
});

describe('canApprove', () => {
  const stage = { approverRole: 'HIRING_MANAGER' as const };
  const job = { hiringManagerId: 'hm1' };
  it('employer always', () => expect(canApprove(u('EMPLOYER'), stage, job)).toBe(true));
  it('owning hiring manager', () => expect(canApprove(u('HIRING_MANAGER', 'hm1'), stage, job)).toBe(true));
  it('other hiring manager no', () => expect(canApprove(u('HIRING_MANAGER', 'hm2'), stage, job)).toBe(false));
  it('recruiter no', () => expect(canApprove(u('RECRUITER'), stage, job)).toBe(false));
  it('matching non-HM role yes', () => expect(canApprove(u('RECRUITER'), { approverRole: 'RECRUITER' }, job)).toBe(true));
});

describe('overlaps', () => {
  const t = new Date('2030-01-01T10:00:00Z');
  const at = (min: number) => new Date(t.getTime() + min * 60_000);
  it('detects overlap', () => expect(overlaps(t, 60, at(30), 60)).toBe(true));
  it('detects containment', () => expect(overlaps(t, 120, at(30), 15)).toBe(true));
  it('back-to-back does not overlap', () => expect(overlaps(t, 60, at(60), 60)).toBe(false));
  it('disjoint', () => expect(overlaps(t, 30, at(120), 30)).toBe(false));
});

describe('render', () => {
  it('substitutes variables', () => expect(render('Hi {{name}}', { name: 'Bob' })).toBe('Hi Bob'));
  it('HTML-escapes variables', () => {
    const out = render('<p>{{name}}</p>', { name: '<script>alert(1)</script>' });
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;');
  });
});
