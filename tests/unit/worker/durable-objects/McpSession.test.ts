import { describe, it, expect } from 'vitest';
import {
  negotiateProtocolVersion,
  SUPPORTED_PROTOCOL_VERSIONS,
} from '../../../../worker/durable-objects/McpSession.js';

describe('negotiateProtocolVersion', () => {
  it('returns the requested version verbatim when supported', () => {
    expect(negotiateProtocolVersion('2025-11-25')).toBe('2025-11-25');
    expect(negotiateProtocolVersion('2025-06-18')).toBe('2025-06-18');
  });

  it('falls back to the newest supported version for unknown future versions', () => {
    // Per MCP spec the server may pick when the client advertises a version
    // the server doesn't support.
    expect(negotiateProtocolVersion('2099-01-01')).toBe(SUPPORTED_PROTOCOL_VERSIONS[0]);
  });

  it('falls back when the requested version string is empty', () => {
    expect(negotiateProtocolVersion('')).toBe(SUPPORTED_PROTOCOL_VERSIONS[0]);
  });
});

describe('SUPPORTED_PROTOCOL_VERSIONS', () => {
  it('lists 2025-11-25 first (newest) per plan key technical decision', () => {
    // Plan: support both 2025-06-18 and 2025-11-25; respond with the lower
    // of client-advertised and server-supported. Listing newest-first lets
    // the negotiation fallback default to the newest.
    expect(SUPPORTED_PROTOCOL_VERSIONS[0]).toBe('2025-11-25');
    expect(SUPPORTED_PROTOCOL_VERSIONS).toContain('2025-06-18');
  });
});
