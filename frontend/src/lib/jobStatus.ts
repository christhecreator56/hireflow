export type JobStatus = 'DRAFT' | 'PUBLISHED' | 'PAUSED' | 'CLOSED';

// Mirrors backend JOB_TRANSITIONS so we only offer buttons the API accepts.
const TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  DRAFT: ['PUBLISHED', 'CLOSED'],
  PUBLISHED: ['PAUSED', 'CLOSED'],
  PAUSED: ['PUBLISHED', 'CLOSED'],
  CLOSED: [],
};

export const nextStatuses = (s: JobStatus) => TRANSITIONS[s] ?? [];

export const statusAction: Record<JobStatus, string> = {
  DRAFT: 'Move to draft',
  PUBLISHED: 'Publish',
  PAUSED: 'Pause',
  CLOSED: 'Close',
};
