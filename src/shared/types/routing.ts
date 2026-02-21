/**
 * Routing Claims
 *
 * These types mirror the backend `RoutingClaims` shape produced by
 * `routing.service.ts` (backend PR #101) and injected into every
 * `GET /auth/get-session` response by `sanitizeAuthResponse` middleware.
 *
 * The frontend should treat these as the single source of truth for
 * workspace access. Do NOT re-derive membership/entitlement on the client.
 */

export interface WorkspaceAccess {
  practice: boolean;
  client: boolean;
  public: boolean;
}

export interface RoutingClaims {
  workspace_access: WorkspaceAccess;
  /** The workspace the user should land on by default. */
  default_workspace: 'practice' | 'client' | 'public';
  /** Role within the active organization (e.g. 'owner', 'member', 'client'). */
  active_membership_role: string | null;
  /** True when the active org has an entitled subscription. */
  practice_entitled: boolean;
}

/**
 * Parse routing claims from the raw session response object.
 * Returns null if the session has no routing property (backend not yet deployed).
 */
export function parseRoutingClaims(session: unknown): RoutingClaims | null {
  if (!session || typeof session !== 'object') return null;
  const s = session as Record<string, unknown>;
  const r = s.routing;
  if (!r || typeof r !== 'object') return null;
  const claims = r as Record<string, unknown>;
  const wa = claims.workspace_access;
  if (!wa || typeof wa !== 'object') return null;
  const access = wa as Record<string, unknown>;
  return {
    workspace_access: {
      practice: access.practice === true,
      client: access.client === true,
      public: access.public !== false, // default true
    },
    default_workspace:
      claims.default_workspace === 'practice'
        ? 'practice'
        : claims.default_workspace === 'client'
          ? 'client'
          : 'public',
    active_membership_role:
      typeof claims.active_membership_role === 'string'
        ? claims.active_membership_role
        : null,
    practice_entitled: claims.practice_entitled === true,
  };
}
