import type { JobStatus } from './lib/jobStatus';
import type { Role } from './lib/auth';

export type QuestionType = 'TEXT' | 'LONG_TEXT' | 'SINGLE_CHOICE' | 'MULTI_CHOICE' | 'YES_NO';
export type Question = { id?: string; label: string; type: QuestionType; options: string[]; required: boolean };
export type StageCategory = 'ACTIVE' | 'HIRED' | 'REJECTED';

export type Stage = {
  id?: string;
  name: string;
  order?: number;
  category: StageCategory;
  notifyCandidate: boolean;
  emailTemplateKey: string | null;
  requiresApproval: boolean;
  approverRole: Role | null;
  _count?: { applications: number };
};

export type PublicJob = {
  id: string;
  title: string;
  department: string | null;
  location: string | null;
  employmentType: string;
  salaryMin: number | null;
  salaryMax: number | null;
  skills: string[];
  publishedAt: string | null;
  description?: string;
  requirements?: string | null;
  questions?: Question[];
  org: { name: string };
};

export type Job = Omit<PublicJob, 'org' | 'questions'> & {
  status: JobStatus;
  description: string;
  requirements: string | null;
  hiringManagerId: string | null;
  hiringManager: { id: string; name: string } | null;
  createdAt: string;
  _count: { applications: number };
  questions?: Question[];
  stages?: Stage[];
  criteria?: { id: string; name: string }[];
};

export type StaffUser = { id: string; name: string; email: string; role: Role; isActive: boolean; createdAt: string };
export type EmailTemplate = { id: string; key: string; name: string; subject: string; bodyHtml: string };
export type Resume = { id: string; fileName: string; mimeType: string; size: number; uploadedAt: string };

export type BoardCard = {
  id: string;
  status: string;
  source: string;
  appliedAt: string;
  currentStageId: string;
  candidate: { id: string; skills: string[]; experienceYears: number | null; anonymizedAt: string | null; user: { name: string } };
  _count: { interviews: number };
  approvals: { id: string; targetStageId: string }[];
};
