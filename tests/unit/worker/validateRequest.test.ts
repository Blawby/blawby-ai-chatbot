/**
 * `validateRequest` is the worker's pre-dispatch sanity check (worker/index.ts).
 * It blocks oversized payloads and POSTs that lack a Content-Type header,
 * with a small carve-out list for endpoints that legitimately POST with no
 * body. When a new no-body endpoint is added, it must be added to that
 * carve-out — otherwise the request 400s before the route handler runs.
 *
 * The /api/search/{practiceId}/reindex endpoint takes no body. Without the
 * carve-out, every `fetch(url, { method: 'POST' })` call to /reindex hits
 * 400 INVALID_REQUEST, the backfill is never enqueued, and the search index
 * stays empty forever.
 */
import { describe, it, expect, beforeAll } from 'vitest';

let validateRequest: (request: Request) => boolean;

beforeAll(async () => {
  ({ validateRequest } = await import('../../../worker/index.js'));
});

const build = (
  url: string,
  init: RequestInit & { headers?: Record<string, string> } = {},
): Request => new Request(url, { method: 'POST', ...init });

describe('validateRequest', () => {
  describe('no-body POST endpoints', () => {
    it('accepts POST /api/search/{id}/reindex with no body and no Content-Type', () => {
      const req = build('https://example.com/api/search/abc-123/reindex');
      expect(validateRequest(req)).toBe(true);
    });

    it('still accepts POST /api/practice-client-intakes/.../files/.../confirm with no body', () => {
      const req = build(
        'https://example.com/api/practice-client-intakes/intake-1/files/file-1/confirm',
      );
      expect(validateRequest(req)).toBe(true);
    });

    it('still accepts POST /api/uploads/.../confirm with no body', () => {
      const req = build('https://example.com/api/uploads/file-1/confirm');
      expect(validateRequest(req)).toBe(true);
    });
  });

  describe('regression coverage for the existing rule', () => {
    it('rejects POST to a non-carved-out endpoint without Content-Type', () => {
      const req = build('https://example.com/api/some-other-endpoint');
      expect(validateRequest(req)).toBe(false);
    });

    it('rejects POST with a non-JSON, non-multipart Content-Type', () => {
      const req = build('https://example.com/api/some-other-endpoint', {
        headers: { 'Content-Type': 'text/plain' },
        body: 'hello',
      });
      expect(validateRequest(req)).toBe(false);
    });

    it('accepts POST with application/json Content-Type', () => {
      const req = build('https://example.com/api/some-other-endpoint', {
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      expect(validateRequest(req)).toBe(true);
    });

    it('rejects payloads larger than 10MB by content-length header', () => {
      const req = new Request('https://example.com/api/some-endpoint', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'content-length': String(11 * 1024 * 1024),
        },
        body: '{}',
      });
      expect(validateRequest(req)).toBe(false);
    });
  });
});
