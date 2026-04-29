/**
 * Wire types for practice/workspace API responses.
 *
 * Practice + Workspace are the worker's runtime representation of an
 * organization. The fields here match the JSON shape the worker emits
 * to the frontend (camelCase) and the backend's contract (where shapes
 * line up). See worker/types.ts for the original definitions; this file
 * is the canonical wire-export point.
 *
 * Re-exported via @/shared/types/wire so frontend services don't import
 * directly from `worker/`.
 */

export type {
  Practice,
  Workspace,
  PracticeOrWorkspace,
  ConversationConfig,
  PracticeConfig,
  SubscriptionLifecycleStatus,
} from '../../types';
