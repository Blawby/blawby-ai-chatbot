import { describe, it, expect } from 'vitest';
import { toCsv } from '../../../../worker/utils/csv';

describe('toCsv', () => {
  it('emits header only when rows are empty', () => {
    const out = toCsv<{ a: string; b: number }>([], [
      { key: 'a', header: 'A' },
      { key: 'b', header: 'B' },
    ]);
    expect(out).toBe('A,B');
  });

  it('escapes quotes, commas, and newlines per RFC 4180', () => {
    const out = toCsv([
      { name: 'Smith, Jones', notes: 'has "quotes"\nand newline' },
    ], [
      { key: 'name', header: 'Name' },
      { key: 'notes', header: 'Notes' },
    ]);
    const lines = out.split('\r\n');
    expect(lines[0]).toBe('Name,Notes');
    expect(lines[1]).toBe('"Smith, Jones","has ""quotes""\nand newline"');
  });

  it('emits empty string for null/undefined', () => {
    const out = toCsv([
      { name: null, amount: undefined },
    ] as unknown as Array<Record<string, unknown>>, [
      { key: 'name', header: 'Name' },
      { key: 'amount', header: 'Amount' },
    ]);
    expect(out).toBe('Name,Amount\r\n,');
  });

  it('applies the column format function before escaping', () => {
    const out = toCsv([
      { cents: 12345 },
    ], [
      {
        key: 'cents',
        header: 'Amount',
        format: (v) => (Number(v) / 100).toFixed(2),
      },
    ]);
    expect(out).toBe('Amount\r\n123.45');
  });
});
