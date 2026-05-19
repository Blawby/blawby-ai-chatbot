import { describe, it, expect } from 'vitest';
import {
  extractSlimContactForFailure,
  extractCollectedFieldsForFailure,
} from '../../../../worker/routes/aiChat.js';

describe('extractSlimContactForFailure', () => {
  it('returns nulls when slimDraft is null', () => {
    expect(extractSlimContactForFailure(null)).toEqual({
      name: null,
      email: null,
      phone: null,
      city: null,
      state: null,
    });
  });

  it('trims and returns string fields when present', () => {
    expect(
      extractSlimContactForFailure({
        name: '  Jane Doe  ',
        email: '  jane@example.com  ',
        phone: '+1-555-555-5555',
        city: 'Charlotte',
        state: 'NC',
      }),
    ).toEqual({
      name: 'Jane Doe',
      email: 'jane@example.com',
      phone: '+1-555-555-5555',
      city: 'Charlotte',
      state: 'NC',
    });
  });

  it('returns null for empty-string fields', () => {
    expect(
      extractSlimContactForFailure({
        name: '',
        email: 'jane@example.com',
        phone: '   ',
      }),
    ).toEqual({
      name: null,
      email: 'jane@example.com',
      phone: null,
      city: null,
      state: null,
    });
  });

  it('returns null for non-string fields', () => {
    expect(
      extractSlimContactForFailure({
        name: 42 as unknown as string,
        email: null as unknown as string,
        phone: undefined as unknown as string,
      }),
    ).toEqual({
      name: null,
      email: null,
      phone: null,
      city: null,
      state: null,
    });
  });
});

describe('extractCollectedFieldsForFailure', () => {
  it('returns null when state is null', () => {
    expect(extractCollectedFieldsForFailure(null)).toBeNull();
  });

  it('returns null when state is empty', () => {
    expect(extractCollectedFieldsForFailure({})).toBeNull();
  });

  it('returns null when no usable fields are present', () => {
    expect(
      extractCollectedFieldsForFailure({
        description: '',
        urgency: 'invalid_value',
        opposingParty: '   ',
      }),
    ).toBeNull();
  });

  it('extracts description and urgency when valid', () => {
    expect(
      extractCollectedFieldsForFailure({
        description: 'Contract dispute',
        urgency: 'time_sensitive',
      })?.description,
    ).toBe('Contract dispute');
    expect(
      extractCollectedFieldsForFailure({
        description: 'Contract dispute',
        urgency: 'time_sensitive',
      })?.urgency,
    ).toBe('time_sensitive');
  });

  it('rejects invalid urgency values', () => {
    expect(
      extractCollectedFieldsForFailure({
        description: 'd',
        urgency: 'super_urgent',
      })?.urgency,
    ).toBeNull();
  });

  it('accepts the three valid urgency tokens (routine, time_sensitive, emergency)', () => {
    for (const value of ['routine', 'time_sensitive', 'emergency']) {
      expect(
        extractCollectedFieldsForFailure({ description: 'd', urgency: value })?.urgency,
      ).toBe(value);
    }
  });

  it('normalizes urgency case', () => {
    expect(
      extractCollectedFieldsForFailure({ description: 'd', urgency: 'TIME_SENSITIVE' })?.urgency,
    ).toBe('time_sensitive');
  });

  it('extracts boolean hasDocuments', () => {
    expect(
      extractCollectedFieldsForFailure({ hasDocuments: true })?.hasDocuments,
    ).toBe(true);
    expect(
      extractCollectedFieldsForFailure({ hasDocuments: false })?.hasDocuments,
    ).toBe(false);
  });

  it('ignores non-boolean hasDocuments', () => {
    const result = extractCollectedFieldsForFailure({
      description: 'd',
      hasDocuments: 'yes' as unknown as boolean,
    });
    expect(result?.hasDocuments).toBeNull();
  });

  it('extracts finite numbers for income and householdSize', () => {
    expect(
      extractCollectedFieldsForFailure({ income: 50000, householdSize: 3 }),
    ).toMatchObject({
      income: 50000,
      householdSize: 3,
    });
  });

  it('rejects non-finite numbers (NaN, Infinity)', () => {
    // include description so the helper does not return null overall
    const result = extractCollectedFieldsForFailure({
      description: 'd',
      income: NaN,
      householdSize: Infinity,
    });
    expect(result?.income).toBeNull();
    expect(result?.householdSize).toBeNull();
  });
});
