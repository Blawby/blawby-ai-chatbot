import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { validateWire } from '../../../../worker/utils/validateWire.js';

const PersonSchema = z.object({
  id: z.string(),
  name: z.string(),
  age: z.number().optional(),
});

describe('validateWire', () => {
  it('returns parsed value on success', () => {
    const valid = { id: 'u1', name: 'Alice', age: 30 };
    expect(validateWire(PersonSchema, valid, 'test')).toEqual(valid);
  });

  it('throws on schema mismatch when strict=true', () => {
    const invalid = { id: 'u1', name: 42 };
    expect(() => validateWire(PersonSchema, invalid, 'test', { strict: true })).toThrow();
  });

  it('returns input as-is and warns when strict=false', () => {
    const invalid = { id: 'u1', name: 42 };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = validateWire(PersonSchema, invalid, 'test', { strict: false });
    expect(result).toEqual(invalid);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('strict default is true in non-production environments', () => {
    // NODE_ENV is 'test' in vitest, which is non-production → strict.
    const invalid = { id: 'u1' /* missing name */ };
    expect(() => validateWire(PersonSchema, invalid, 'test')).toThrow();
  });

  it('redacts sensitive fields when warning under strict=false', () => {
    const invalid = { id: 'u1', name: 42, password: 'hunter2', token: 'sk_live_abc' };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    validateWire(PersonSchema, invalid, 'test', { strict: false });
    const args = warn.mock.calls[0];
    const payload = JSON.stringify(args);
    expect(payload).not.toContain('hunter2');
    expect(payload).not.toContain('sk_live_abc');
    expect(payload).toContain('[redacted]');
    warn.mockRestore();
  });
});
