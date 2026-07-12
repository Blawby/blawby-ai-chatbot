import { describe, expect, it } from 'vitest';
import worker, { scheduled } from '../../../worker/index.js';

describe('Worker entrypoint', () => {
  it('exports the scheduled handler to the Cloudflare runtime', () => {
    expect(worker.scheduled).toBe(scheduled);
  });
});
