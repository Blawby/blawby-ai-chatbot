import { describe, it, expect } from 'vitest';
import {
  parseQuery,
  SEARCH_SCOPES,
  SEARCH_FILTER_KEYS,
  type ParsedQuery,
} from '../parseQuery';

describe('parseQuery', () => {
  describe('table cases', () => {
    it.each<[string, ParsedQuery]>([
      ['', { scopes: [], filters: {}, terms: '' }],
      ['   ', { scopes: [], filters: {}, terms: '' }],
      ['steve smith', { scopes: [], filters: {}, terms: 'steve smith' }],
      [
        'in:invoices steve smith',
        { scopes: ['invoices'], filters: {}, terms: 'steve smith' },
      ],
      [
        'in:matters status:active deposition',
        {
          scopes: ['matters'],
          filters: { status: 'active' },
          terms: 'deposition',
        },
      ],
      [
        'status:overdue',
        { scopes: [], filters: { status: 'overdue' }, terms: '' },
      ],
      [
        'in:files indemnification',
        { scopes: ['files'], filters: {}, terms: 'indemnification' },
      ],
      [
        'INV-2026-0042',
        { scopes: [], filters: {}, terms: 'INV-2026-0042' },
      ],
    ])('parses %j', (input, expected) => {
      expect(parseQuery(input)).toEqual(expected);
    });
  });

  describe('scope handling', () => {
    it('preserves multiple distinct scopes in order', () => {
      expect(parseQuery('in:invoices in:matters foo')).toEqual({
        scopes: ['invoices', 'matters'],
        filters: {},
        terms: 'foo',
      });
    });

    it('dedupes repeated scopes', () => {
      expect(parseQuery('in:invoices in:invoices foo')).toEqual({
        scopes: ['invoices'],
        filters: {},
        terms: 'foo',
      });
    });

    it('treats unknown scope as free-text', () => {
      expect(parseQuery('in:unknown foo')).toEqual({
        scopes: [],
        filters: {},
        terms: 'in:unknown foo',
      });
    });
  });

  describe('filter handling', () => {
    it('treats unknown filter key as free-text', () => {
      expect(parseQuery('priority:high foo')).toEqual({
        scopes: [],
        filters: {},
        terms: 'priority:high foo',
      });
    });

    it('last-wins on duplicate filter keys', () => {
      expect(parseQuery('status:active status:closed')).toEqual({
        scopes: [],
        filters: { status: 'closed' },
        terms: '',
      });
    });
  });

  describe('whitespace', () => {
    it('collapses extra whitespace around tokens', () => {
      expect(parseQuery('  in:invoices    steve   ')).toEqual({
        scopes: ['invoices'],
        filters: {},
        terms: 'steve',
      });
    });
  });

  describe('exported whitelists', () => {
    it('exposes every supported scope', () => {
      expect(SEARCH_SCOPES).toEqual([
        'clients',
        'matters',
        'invoices',
        'conversations',
        'files',
        'intakes',
        'notes',
      ]);
    });

    it('exposes every supported filter key', () => {
      expect(SEARCH_FILTER_KEYS).toEqual(['status', 'archived', 'assignee']);
    });
  });
});
