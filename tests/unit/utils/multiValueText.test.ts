import { describe, expect, it } from 'vitest';
import { parseMultiValueText, serializeMultiValueText } from '@/features/matters/utils/multiValueText';

describe('multiValueText helpers', () => {
  it('parses empty values as an empty list', () => {
    expect(parseMultiValueText(undefined)).toEqual([]);
    expect(parseMultiValueText(null)).toEqual([]);
    expect(parseMultiValueText('')).toEqual([]);
    expect(parseMultiValueText('   ')).toEqual([]);
  });

  it('parses semicolon-delimited values and trims each entry', () => {
    expect(parseMultiValueText(' Hon. A. Smith ;  Opposing Co ;  ')).toEqual([
      'Hon. A. Smith',
      'Opposing Co'
    ]);
  });

  it('deduplicates parsed values case-insensitively while keeping first casing', () => {
    expect(parseMultiValueText('Acme Corp; acme corp; ACME CORP; Beta LLC')).toEqual([
      'Acme Corp',
      'Beta LLC'
    ]);
  });

  it('serializes values with semicolon + space delimiter', () => {
    expect(serializeMultiValueText(['Hon. A. Smith', 'Opposing Co'])).toBe('Hon. A. Smith; Opposing Co');
  });

  it('normalizes and deduplicates while serializing', () => {
    expect(serializeMultiValueText(['  Acme Corp  ', '', 'acme corp', 'Beta LLC'])).toBe('Acme Corp; Beta LLC');
  });

  it('supports parse/serialize round-trip stability', () => {
    const parsed = parseMultiValueText('Judge One; judge one; Judge Two');
    expect(serializeMultiValueText(parsed)).toBe('Judge One; Judge Two');
  });
});
