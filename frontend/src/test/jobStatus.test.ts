import { describe, expect, it } from 'vitest';
import { nextStatuses } from '../lib/jobStatus';

describe('nextStatuses', () => {
  it('offers only transitions the API accepts', () => {
    expect(nextStatuses('DRAFT')).toEqual(['PUBLISHED', 'CLOSED']);
    expect(nextStatuses('PUBLISHED')).toEqual(['PAUSED', 'CLOSED']);
    expect(nextStatuses('PAUSED')).toEqual(['PUBLISHED', 'CLOSED']);
    expect(nextStatuses('CLOSED')).toEqual([]);
  });
});
