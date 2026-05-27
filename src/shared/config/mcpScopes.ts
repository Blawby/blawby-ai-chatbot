/**
 * OAuth / Claude Desktop access scope vocabulary.
 *
 * Single source of truth for the OAuth scopes Blawby currently grants to
 * Claude Desktop. Reused by both the OAuth consent screen (`/oauth/consent`)
 * and the practice settings surface (Settings → Apps → Claude Desktop) so
 * scope copy never drifts between them.
 *
 * Scope ids are owned by the backend Better Auth OAuth provider. Keep these ids
 * aligned with the provider's registered scopes; friendly copy here is
 * presentation-only.
 */

export type McpScopeCategory = 'matters' | 'clients' | 'invoices' | 'other';

export interface McpScope {
  /** Canonical scope id as issued by the backend OAuth provider. */
  id: string;
  /** Short, human-friendly label. */
  title: string;
  /** Plain-language explanation of what granting the scope allows. */
  description: string;
  category: McpScopeCategory;
}

export const MCP_SCOPES: McpScope[] = [
  {
    id: 'matters:read',
    title: 'View matters',
    description: 'Allows read-only access to matter details.',
    category: 'matters',
  },
  {
    id: 'matters:write',
    title: 'Create and update matters',
    description: 'Allows creating and editing matters.',
    category: 'matters',
  },
  {
    id: 'clients:read',
    title: 'View clients',
    description: 'Allows read-only access to client records.',
    category: 'clients',
  },
  {
    id: 'clients:write',
    title: 'Create and update clients',
    description: 'Allows creating and editing client records.',
    category: 'clients',
  },
  {
    id: 'invoices:read',
    title: 'View invoices',
    description: 'Allows read-only access to invoices.',
    category: 'invoices',
  },
  {
    id: 'invoices:write',
    title: 'Create and update invoices',
    description: 'Allows creating and editing invoices.',
    category: 'invoices',
  },
];

export const MCP_SCOPE_CATEGORY_LABELS: Record<McpScopeCategory, string> = {
  matters: 'Matter access',
  clients: 'Client access',
  invoices: 'Invoice access',
  other: 'Additional access',
};

const CATEGORY_ORDER: McpScopeCategory[] = ['matters', 'clients', 'invoices', 'other'];

const MCP_SCOPE_BY_ID = new Map<string, McpScope>(MCP_SCOPES.map((scope) => [scope.id, scope]));

/**
 * Resolve a scope id to its friendly descriptor. Unknown ids (e.g. a scope the
 * backend added before the frontend vocabulary caught up) fall back to a safe
 * generic descriptor that still shows the raw id, rather than hiding it.
 */
export function describeMcpScope(id: string): McpScope {
  return (
    MCP_SCOPE_BY_ID.get(id) ?? {
      id,
      title: id,
      description: 'Access requested by the application.',
      category: 'other',
    }
  );
}

/**
 * Parse a space-separated OAuth `scope` parameter into descriptors. Tolerates
 * `+`-encoded separators that survive some redirect chains.
 */
export function parseScopeString(scope: string | null | undefined): McpScope[] {
  if (!scope) return [];
  return scope
    .split(/[\s+]+/)
    .filter(Boolean)
    .map(describeMcpScope);
}

/** Group scopes by category in a stable render order, dropping empty groups. */
export function groupMcpScopes(
  scopes: McpScope[]
): Array<{ category: McpScopeCategory; label: string; scopes: McpScope[] }> {
  return CATEGORY_ORDER.map((category) => ({
    category,
    label: MCP_SCOPE_CATEGORY_LABELS[category],
    scopes: scopes.filter((scope) => scope.category === category),
  })).filter((group) => group.scopes.length > 0);
}
