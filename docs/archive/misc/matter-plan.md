# Leads System Using Matters & Better Auth Members

## Current State

**Existing Matters Schema:**

- `status` field with values: `'lead'`, `'open'`, `'in_progress'`, `'completed'`, `'archived'`
- Default status is `'lead'`
- No persistent assignee column in v1 (greenfield). Assignment is implicit via audit logs (the member who accepted the lead).

**Existing Better Auth Members:**

- `members` table: `id`, `organization_id`, `user_id`, `role` ('owner', 'admin', 'attorney', 'paralegal')
- `GET /api/organizations/{id}/member` - Returns members with userId, role, email, name, image
- `useOrganizationManagement` hook with `getMembers()` and `fetchMembers()` methods

**Existing Contact Form Flow:**

1. AI shows contact form via `show_contact_form` tool
2. User submits contact form → Frontend calls `POST /api/practice-client-intakes/submit`
3. Server creates a `matter` directly with `status='lead'` (no `contact_forms` table)
4. AI can also call `create_matter` tool which creates the same `matter` shape

**Existing Workspace API:**

- `GET /api/organizations/{id}/workspace/matters` - Already supports status filtering
- Returns: id, title, matterType, status, priority, clientName, leadSource, createdAt, updatedAt
- Can filter by status: `?status=lead`

**Current Issues:**

- Contact form submission and matter creation are separate flows
- Remove legacy `contact_forms` concept to keep greenfield simple
- No styled UI for organization members to view/manage leads

## Goal

Use existing matters table to manage leads - contact form creates matter with status='lead', organization members view and manage leads via existing workspace matters endpoint. Use Better Auth members for lawyer assignment.

**Key Changes:**

- **Contact form submission → Creates matter with status='lead'** directly
- **Leads are matters with status='lead'**
- **No persistent assignee field in v1** — display "Accepted by" using audit logs (the member who performed the accept action)
- **Organization members view leads** via existing workspace matters endpoint (filter by status='lead')
- **Style existing matters page** for organization members to view/manage leads
- **Add status transition endpoints** to accept/reject leads

## Implementation

### Phase 1: Update Contact Form Flow

**Contact form creates matter directly:**

- Update `POST /api/practice-client-intakes/submit` to create matter with status='lead'
- Matter created immediately but with lead status

**Files to Modify:**

- `staging-api` intake submission endpoint - Update to create matter instead of just saving to contact_forms

### Phase 2: Matter Status Transition API

**Add status transition endpoints to matters API:**

- `PATCH /api/organizations/{id}/workspace/matters/{matterId}/status` - Update matter status
- `POST /api/organizations/{id}/workspace/matters/{matterId}/accept` - Accept lead (lead → open)
- `POST /api/organizations/{id}/workspace/matters/{matterId}/reject` - Reject lead (lead → archived)

**Status Transition Logic:**

- Validate allowed transitions (e.g., 'lead' → 'open', 'lead' → 'archived', 'open' → 'in_progress', etc.)
- When accepting lead: Record audit event with `acceptedByUserId = authContext.user.id` and timestamp
- Validate accepting user is a member with role 'attorney', 'admin', or 'owner'
- No explicit assignee parameter in v1 (keep simple). Optional future enhancement can add explicit assignment.
- Send notifications on status changes

**Notifications (Email) on Status Changes:**

- Service: `worker/services/NotificationService.ts`
  - `sendMatterCreatedNotification` on `POST /api/practice-client-intakes/submit`
  - `sendMatterUpdateNotification` for `accept`, `reject`, and generic `status_change`
- Wiring points (org workspace route): `worker/routes/organizations.ts`
  - Accept handler → calls `sendMatterUpdateNotification({ update: { action: 'accept', fromStatus, toStatus, actorId } })`
  - Reject handler → calls `sendMatterUpdateNotification({ update: { action: 'reject', fromStatus, toStatus, actorId } })`
  - Status handler → calls `sendMatterUpdateNotification({ update: { action: 'status_change', fromStatus, toStatus, actorId } })`
- Recipient resolution: owner email via `organization.config.ownerEmail`.
- All sends are best-effort (logged, non-blocking for API response).

**DB Performance Indexes:**

- Migration: `worker/migrations/20251106_matter_indexes.sql`
  - `CREATE INDEX IF NOT EXISTS idx_matters_org_status_created_at ON matters(organization_id, status, created_at DESC)`
  - `CREATE INDEX IF NOT EXISTS idx_matter_events_matter_type_date ON matter_events(matter_id, event_type, event_date DESC)`
  - Ensure `closed_at` column exists on `matters` for closed statuses

**Assignment Display (Derived):**

- Show "Accepted by" in UI using the audit log entry for the accept action
- If no accept action exists, display "Unassigned"

**Files to Modify:**

- `worker/routes/organizations.ts` - Add matter status transition endpoints (after workspace routes, around line 518)
- `worker/services/OrganizationService.ts` - Add matter status update methods (or create MatterService)

### Phase 3: Conversation-Centric UI (No Separate Matters Page in v1)

**Left Sidebar (Conversations) Requirements:**

- Each matter appears as a conversation item (title-only) in the existing sidebar
- Quick filters: Status (default `Lead`), search by client name/title
- Pagination/infinite scroll for long lists

**Conversation Header Actions:**

- Show status badge (header) and client/matter type
- Primary actions: `Accept Lead`, `Reject Lead` (visible when status = `lead`)
- Secondary: `Change Status` (generic PATCH when not a lead)
- Display "Accepted by <Name>" from audit log

**APIs Used:**

- `GET /api/organizations/{id}/workspace/matters?status=lead&limit=50&cursor=...&q=...`
- Optional user-centric view for multi-org users: `GET /api/me/matters?status=lead|open&limit=...&cursor=...` (aggregates across orgs user belongs to)
- Responses return minimal fields for sidebar rows: `id, title, clientName, status, createdAt, updatedAt, acceptedBy?`

**Files to Modify:**

- `src/components/sidebar/*` (or equivalent) - Add matter list data source and filters (no badges in list)
- `src/components/chat/ConversationHeader.tsx` (or equivalent) - Add Accept/Reject/Change Status actions
- `src/hooks/useOrganizationManagement.ts` - Add matter management methods (accept/reject/status)
- `worker/routes/organizations.ts` - Ensure list endpoint supports `limit`, `cursor`, `q`, `status`

**Files to Create (small):**

- `src/hooks/useMattersSidebar.ts` - Fetch + cache sidebar list with pagination/filters
  (Status badge rendering will reuse `src/components/ui/badges/StatusBadge.tsx` in header/right sidebar)

### Activity/Audit Integration (existing services)

- Use existing `ActivityService` for logging matter actions:
  - File: `worker/services/ActivityService.ts`
    - `createEvent(...)` inserts into `matter_events` (see lines 288–331)
    - `getMatterEvents(...)` fetches events by matter (see lines 39–73)
    - `queryActivity(...)` supports filtering/pagination (see lines 121–286)
- Public route for activity:
  - File: `worker/routes/activity.ts`
    - `handleCreateActivity` POST handler (see lines ~236–300)
    - `handleGetActivity` GET handler with pagination and filters (see lines ~72–161, 121–135 for query call)
- Schema tables already present:
  - `matter_events` in `worker/schema.sql` (see lines 121–137)
  - Optional session events via `session_audit_events` read in `ActivityService.getSessionEvents(...)`

Note: A standalone Matters page can be added later as an optional enhancement if teams want a tabular view.

### Phase 4: Update Matter Creation

**Update `create_matter` tool handler:**

- Create matter with status='lead' (already does this)
- Matter exists but is in lead stage
- Can be accepted/rejected later

**Files to Modify:**

- `worker/agents/legal-intake/index.ts` - Ensure `handleCreateMatter()` sets status='lead' (already does this)
- `worker/utils.ts` - Ensure `createMatterRecord()` defaults to status='lead' (already does this)

## Best-Practice Alignment (Auth, Billing, API)

- **RBAC via Better Auth (single source of truth):**
  - Use session `user.id` and org membership to gate actions.
  - Roles allowed to mutate status: `owner`, `admin`, `attorney`. `paralegal` read-only in v1.
- **Stripe Entitlements (tiers.ts):**
  - Enforce per-organization entitlements on listing limits, filters, and actions using existing guard patterns.
  - Keep mutations under org-scoped routes to reuse existing checks.
- **API Contracts & Idempotency:**
  - Mutations accept `Idempotency-Key` header (or `idempotencyKey` in body). Store for 24h.
  - Consistent errors: 400 (validation), 401 (unauth), 403 (forbidden), 404 (not found), 409 (idempotency conflict).
- **Observability & Audit:**
  - All transitions produce audit log entries (`accept`, `reject`, `status_change`).
  - Structured logs include `orgId`, `matterId`, `actorUserId`.
- **Minimal Data Model:**
  - No persistent assignee in v1. Derive "Accepted by" from audit logs.
- **Access Scopes:**
  - Client scope shows matters where `client_user_id = me`.
  - Member scope shows org matters where the user is a member, filtered by RBAC/entitlements.
- **Performance:**
  - Server-side pagination with `limit`, `cursor`. Sidebar virtualization.

### User-Centric Listing Contract

- `GET /api/me/matters?status=lead|open|in_progress|completed|archived&scope=client|member|all&limit=50&cursor=...&q=...`
  - Returns:
  ```json
  {
    "items": [
      {
        "id": "matter_123",
        "title": "Employment termination",
        "clientName": "Jane D.",
        "status": "lead",
        "acceptedBy": { "userId": "user_attorney_1", "name": "A. Smith" },
        "organization": { "id": "org_1", "name": "Acme Law", "slug": "acme" },
        "role": "client" | "member",
        "createdAt": "...",
        "updatedAt": "..."
      }
    ],
    "nextCursor": "..."
  }
  ```
  - Security: For `scope=member`, include only orgs where Better Auth membership exists; for `scope=client`, only `client_user_id = me`.

## UI Breakdown

### Client Side (Free Users - Lead Submission)

**Current UI:**

- Chat interface (`ChatContainer`) - already exists
- Contact form in chat (`ContactForm` component) - already exists
- MatterCanvas - shows matter details after creation
- MatterTab - shows matter status

**Changes Needed:**

- Minimal changes - contact form submission already works
- After submission, show confirmation: "Your lead has been submitted. The legal team will review and contact you."
- MatterCanvas can show lead status (status='lead') with message: "Waiting for review"

**Files to Modify:**

- `src/utils/forms.ts` - Update confirmation message for lead submission
- `src/components/MatterCanvas.tsx` - Show lead status badge
- `src/components/MatterTab.tsx` - Show lead status and waiting message

### Organization Side (Legal Teams - Lead Management)

**Use Existing Workspace Matters Endpoint:**

- `GET /api/organizations/{id}/workspace/matters?status=lead` - Get all leads
- Already returns all necessary fields
- Optionally enhance to include derived `acceptedBy` and display member info

**Conversation-Centric Flow:**

- Leads and matters appear directly in the chat sidebar
- Conversation header provides Accept/Reject/Change Status
- Optional detail modal can be opened from the header (not required for v1)

**Files to Create (small):**

- `src/hooks/useMattersSidebar.ts`
- `src/components/matters/StatusBadge.tsx`

**Files to Modify:**

- `src/components/sidebar/*` - Sidebar list data source, filters, badges
- `src/components/chat/ConversationHeader.tsx` - Header actions (Accept/Reject/Change Status)
- `src/hooks/useOrganizationManagement.ts` - Add matter management methods (accept/reject)

**UI Flow:**

1. Client submits lead → Chat shows confirmation
2. Sidebar shows new conversation with status `Lead`
3. Member opens conversation → header shows Accept/Reject
4. Accept → Status becomes `Open`; audit log records `acceptedByUserId`
5. Reject → Status becomes `Archived`

## Success Criteria

- Contact form submission creates matter with status='lead'
- Client sees confirmation message after submission
- Sidebar shows leads as conversations filtered by status (default Lead)
- Conversation header supports Accept/Reject and generic Change Status
- "Accepted by" shown from audit log; no persistent assignee field in v1
- Uses existing matters table and workspace API - no new proposals table needed
- Uses existing Better Auth members system for membership and display only

## Dependencies

- Existing `matters` table with `status` field
- Existing `members` table (Better Auth) with: `id`, `organization_id`, `user_id`, `role` ('owner', 'admin', 'attorney', 'paralegal')
- Existing members API: `GET /api/organizations/{id}/member` (returns members with userId, role, email, name)
- Existing `useOrganizationManagement` hook with `getMembers()` and `fetchMembers()` methods
- Existing workspace matters endpoint: `GET /api/organizations/{id}/workspace/matters`
- Existing authentication middleware (`requireOrgMember`, `requireOrgOwner`)
- Existing organization API patterns

## Risks & Considerations

- Status Transitions: Need validation to prevent invalid transitions
- Audit Source of Truth: Without a persistent assignee, UI relies on audit logs to show "Accepted by"; if explicit assignment is needed later, add as a separate enhancement
- Sidebar/Header UX: Ensure scalable sidebar filters/pagination and clear header actions; avoid clutter for high-volume orgs
- RBAC: When accepting/rejecting, validate accepting user is a member with appropriate role ('owner','admin','attorney')
