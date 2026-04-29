/**
 * Wire types for auth/session resources — backend HTTP contract.
 *
 * snake_case fields, exactly matching the backend at
 * `BACKEND_API_URL` (staging-api.blawby.com / production-api.blawby.com).
 *
 * Frontend code imports these via `@/shared/types/wire`.
 */

// Minimal backend session record shape (extendable by backend).
export interface BackendSession {
  id?: string | null;
  created_at?: string | null;
  expires_at?: string | null;
  // allow additional backend-provided fields
  [key: string]: unknown;
}
