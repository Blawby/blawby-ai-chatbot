export const SEARCH_SCOPES = [
  'clients',
  'matters',
  'invoices',
  'conversations',
  'files',
  'intakes',
  'notes',
] as const;

export type SearchScope = (typeof SEARCH_SCOPES)[number];

export const SEARCH_FILTER_KEYS = ['status', 'archived', 'assignee'] as const;

export type SearchFilterKey = (typeof SEARCH_FILTER_KEYS)[number];

export type ParsedQuery = {
  scopes: SearchScope[];
  filters: Record<string, string>;
  terms: string;
};

const SCOPE_SET: ReadonlySet<string> = new Set(SEARCH_SCOPES);
const FILTER_KEY_SET: ReadonlySet<string> = new Set(SEARCH_FILTER_KEYS);

export function parseQuery(input: string): ParsedQuery {
  const scopes: SearchScope[] = [];
  const seenScopes = new Set<SearchScope>();
  const filters: Record<string, string> = {};
  const freeText: string[] = [];

  const tokens = input.trim().split(/\s+/).filter(Boolean);

  for (const token of tokens) {
    const colonIdx = token.indexOf(':');
    const hasKeyValueShape =
      colonIdx > 0 && colonIdx < token.length - 1;

    if (hasKeyValueShape) {
      const key = token.slice(0, colonIdx);
      const value = token.slice(colonIdx + 1);

      if (key === 'in') {
        if (SCOPE_SET.has(value)) {
          const scope = value as SearchScope;
          if (!seenScopes.has(scope)) {
            seenScopes.add(scope);
            scopes.push(scope);
          }
          continue;
        }
        freeText.push(token);
        continue;
      }

      if (FILTER_KEY_SET.has(key)) {
        filters[key] = value;
        continue;
      }

      freeText.push(token);
      continue;
    }

    freeText.push(token);
  }

  return {
    scopes,
    filters,
    terms: freeText.join(' '),
  };
}
