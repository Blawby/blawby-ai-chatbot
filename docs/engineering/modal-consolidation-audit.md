# Modal Consolidation & WelcomeModal Bug Fix — Remaining Work Only

This file tracks only what’s left to do. For the full audit history and details, see:
- docs/archive/modal-consolidation-audit-full-2025-11-05.md

## Remaining (from plan)

- [ ] Unit tests for `useWelcomeModal`
  - Session pending returns shouldShow=false
  - Debounce via sessionStorage key `welcomeModalShown_v1_<userId>`
  - BroadcastChannel mirrors suppression across tabs
  - `markAsShown()` updates storage and suppresses UI

- [ ] Integration tests for `POST /api/users/welcome`
  - Auth required (401 when unauthenticated)
  - Idempotent update of `welcomed_at`
  - Returns `{ welcomedAt }`

- [ ] Optional: extract additional atoms/molecules
  - PricingModal: factor shared pieces if needed
  - ContactOptionsModal: further dedupe if desired

- [ ] Optional: docs README note on new modal import paths
  - Prefer `src/components/modals/organisms`
  - Barrels available under `src/components/modals`
