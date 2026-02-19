# Backend Contract: `GET /api/auth/get-session` Routing Fields

## Goal
Return backend-computed routing claims from `get-session` so frontend can stop inferring workspace access from billing internals.

## Required response shape
Add `routing` to `GET /api/auth/get-session`:

```json
{
  "routing": {
    "workspace_access": {
      "practice": true,
      "client": true,
      "public": true
    },
    "default_workspace": "practice",
    "active_membership_role": "owner"
  }
}
```

## Field semantics
- `routing.workspace_access.practice`
  - User is allowed to use practice workspace features.
- `routing.workspace_access.client`
  - User is allowed to use client workspace features.
- `routing.workspace_access.public`
  - User can access public-facing workspace routes.
- `routing.default_workspace`
  - Backend-selected default workspace.
  - Must always match an allowed workspace.
- `routing.active_membership_role`
  - Role in active organization context (`owner/admin/attorney/paralegal/member/client/null`).

## How backend should compute these fields

### Workspace model in this app
- Workspaces are only: `practice`, `client`, `public`.
- Better Auth anonymous plugin means users can have authenticated anonymous sessions.
- Anonymous is session/user state, not a separate workspace.

### Inputs
1. Better Auth session.
2. `user.is_anonymous` (exact field from `get-session`).
3. Active organization context from session (`session.active_organization_id`).
4. Membership record in active organization (if any).
5. Subscription/entitlement state for practice features.

### Computation rules
1. Resolve `membership_role` for active org (if any).
2. Resolve `practice_entitled` from subscription/entitlements (not from Stripe customer linkage alone).
3. Set `workspace_access.practice = true` only when all are true:
   - user is not anonymous, and
   - user has active org membership, and
   - active org/user is entitled for practice workspace.
4. Set `workspace_access.client = true` when any are true:
   - user has client-level access in active org, or
   - user has org membership but no practice entitlement, or
   - user is identified (non-anonymous) and policy allows client workspace by default.
5. Set `workspace_access.public = true` for all sessions unless explicitly blocked.
6. Set `active_membership_role` from active org membership, else `null`.
7. Set `default_workspace` with strict precedence:
   - `"practice"` when `workspace_access.practice = true`
   - else `"client"` when `workspace_access.client = true`
   - else `"public"`

### Required invariants
- `default_workspace` must always point to a workspace where `workspace_access[default_workspace] = true`.
- Anonymous sessions must never get `workspace_access.practice = true`.
- If `workspace_access.practice = true`, active org context and membership role must be resolvable.

## Better Auth / Stripe plugin notes
- `user.role` is global account role; do not use it for workspace routing.
- Stripe linkage fields (for example customer id) are billing metadata, not authorization claims.
- Subscription state from Stripe plugin can feed entitlement calculation, but returned routing flags must be final backend decisions.

## Acceptance criteria
1. Same user/session always gets deterministic `routing.*` values.
2. Practice owners with valid entitlement return:
   - `workspace_access.practice = true`
   - `default_workspace = "practice"`
3. Client members without practice entitlement return:
   - `workspace_access.practice = false`
   - `workspace_access.client = true`
   - `default_workspace = "client"`
4. Anonymous sessions return:
   - `workspace_access.public = true`
   - `workspace_access.practice = false`
   - `default_workspace = "public"`
