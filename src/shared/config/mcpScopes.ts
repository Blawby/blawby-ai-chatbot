/**
 * MCP / Claude Desktop access scope vocabulary.
 *
 * Single source of truth for the OAuth scopes a practice can grant to an
 * external MCP client (e.g. Claude Desktop). Reused by both the OAuth consent
 * screen (`/oauth/consent`) and the practice settings surface
 * (Settings → Apps → Claude Desktop) so scope copy never drifts between them.
 *
 * Scope ids are owned by the backend OAuth provider (Blawby/blawby-backend#282).
 * Keep these ids aligned with the provider's registered scopes — the friendly
 * title/description are presentation-only.
 */

export type McpScopeCategory = 'read' | 'write' | 'money' | 'events';

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
    id: 'intakes:read',
    title: 'View intakes',
    description: 'Read client intake submissions and their form responses.',
    category: 'read',
  },
  {
    id: 'matters:read',
    title: 'View matters',
    description: 'Read matters (cases), their status, and details.',
    category: 'read',
  },
  {
    id: 'invoices:read',
    title: 'View invoices',
    description: 'Read invoices, line items, and payment status.',
    category: 'read',
  },
  {
    id: 'clients:read',
    title: 'View clients',
    description: 'Read client contact records.',
    category: 'read',
  },
  {
    id: 'conversations:read',
    title: 'View conversations',
    description: 'Read message threads between the practice and its clients.',
    category: 'read',
  },
  {
    id: 'payments:read',
    title: 'View payments',
    description: 'Read payment records and their status.',
    category: 'read',
  },
  {
    id: 'team:read',
    title: 'View team',
    description: 'Read team members and their roles.',
    category: 'read',
  },
  {
    id: 'intakes:write',
    title: 'Manage intakes',
    description: 'Create or update intake submissions.',
    category: 'write',
  },
  {
    id: 'matters:write',
    title: 'Manage matters',
    description: 'Create or update matters.',
    category: 'write',
  },
  {
    id: 'messages:send_as_practice',
    title: 'Send messages as the practice',
    description: 'Send messages to clients on behalf of the practice.',
    category: 'write',
  },
  {
    id: 'invoices:send',
    title: 'Send invoices',
    description: 'Send invoices to clients to request payment.',
    category: 'money',
  },
  {
    id: 'invoices:refund',
    title: 'Refund invoices',
    description: 'Issue refunds against invoices.',
    category: 'money',
  },
  {
    id: 'payments:refund',
    title: 'Refund payments',
    description: 'Issue refunds against captured payments.',
    category: 'money',
  },
  {
    id: 'events:subscribe',
    title: 'Subscribe to events',
    description: 'Receive real-time notifications about practice activity.',
    category: 'events',
  },
];

export const MCP_SCOPE_CATEGORY_LABELS: Record<McpScopeCategory, string> = {
  read: 'View access',
  write: 'Create & update',
  money: 'Money actions',
  events: 'Realtime events',
};

/** Category render order, most-benign first, money-moving last. */
const CATEGORY_ORDER: McpScopeCategory[] = ['read', 'write', 'money', 'events'];

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
      category: 'read',
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
