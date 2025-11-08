Perfect! Now I have the complete schema picture. This is extremely helpful. Let me revise the build plan to work **within the existing schema** and avoid unnecessary new tables.

---

# Revised Build Plan: Multi-Org Chat & Tool Refactor
## Working Within Existing Schema

---

## Key Schema Insights Affecting the Plan

**✅ What We Can Reuse:**
1. **`conversations` table exists** - Currently unused, perfect for conversation/thread abstraction
2. **`organizations.config` JSON** - Already supports flexible configuration, can add tool permissions here
3. **Better Auth `sessions.active_organization_id`** - Already tracks user's active org
4. **`usage_quotas` table** - Can be extended for tool-specific quotas without schema changes (use metadata pattern)
5. **`members` table** - Can support agent members without schema changes (role-based)

**❌ What We Don't Need to Create:**
1. No new tool registry table - use config + code registry
2. No new permissions table - use `organizations.config` JSON
3. No new agent table - use existing `users` + `members`
4. No new thread table - use existing `conversations`

---

## Phase 1: Foundation - Configuration & Constants

### Issue #1: Extend Organization Config Schema for Tools
**Type:** Enhancement  
**Priority:** High  
**Files:**
- `worker/services/OrganizationService.ts` (extend interface)
- `worker/schemas/validation.ts` (extend Zod schema)
- `worker/migrations/20250X_add_tool_config_to_blawby.sql` (update blawby-ai config)

**Tasks:**
- [x] Extend `OrganizationConfig` interface to include:
  ```typescript
  tools?: {
    [toolName: string]: {
      enabled: boolean;
      quotaMetric?: 'messages' | 'files' | null;
      requiredRole?: 'owner' | 'admin' | 'member' | null;
      allowAnonymous?: boolean;
    }
  };
  agentMember?: {
    enabled: boolean;
    userId: string; // Reference to agent user
    autoInvoke?: boolean;
    tagRequired?: boolean;
  };
  ```
- [x] Update Zod validation schema
- [x] Create migration to add tool config to `blawby-ai` org
- [x] Add config caching in `OrganizationConfigService`

**Acceptance Criteria:**
- Tool permissions stored in `organizations.config` JSON
- Validation enforces config structure
- Blawby-ai org seeded with default tool config

---

### Phase 1 Follow-ups: Fixes and Additional Review Items

- **Matter status transitions (UI) — ConversationHeader.tsx**
  - Added `STATUS_TRANSITIONS` and constrained status dropdown to current status + valid transitions.
  - Prevented illegal transitions and restricted `lead` to self when applicable.

- **Payment instructions (forms.ts)**
  - Made payment block independent of `hasMatter` branch to always append to `confirmationContent`.
  - Logged warnings when `fee <= 0` or missing `paymentLink` and concatenated copy with proper spacing.

- **Cloudflare D1 migration safety (20251106_matter_indexes.sql)**
  - Removed unsupported `ALTER TABLE ... IF NOT EXISTS` for D1.
  - Kept transaction boundaries; rely on migration runner to ignore duplicate-column error or preflight separately.

- **Abort in-flight requests on unmount (useMattersSidebar.ts)**
  - Added cleanup effect to abort pending fetch via `AbortController` on unmount to avoid state updates after unmount.

- **Sidebar auto-selection behavior (SidebarContent.tsx)**
  - Respected upstream `selectedMatterId` to avoid clobbering selection.
  - Reset initial auto-select marker when `organizationId` changes and included it in deps.

- **Auth + Org consolidation (flicker-free startup)**
  - Removed Better Auth organization plugin usage on the client and all custom ActiveOrganization/Auth/Organization providers.
  - Consolidated on a single `SessionProvider` exposing `session`, `activeOrganizationId` (derived from the session), and quota state.
  - Introduced a unified loading gate keyed off `authClient.useSession()` during hydration; no polling.
  - Added a minimal `setActiveOrganization(orgId)` helper that calls `PATCH /api/sessions/organization` and triggers session revalidation.
  - All consumers (chat, upload, payments) now read `activeOrganizationId` from `SessionProvider` only.

- **General**
  - Ensured all new effects include precise dependency arrays.
  - Preserved existing capabilities while eliminating non-blocking console errors.

**Outcome:** Clean startup (no BA org 400s), single `get-session` on boot, no polling loops, and stable org state across the app.

### Issue #2: Create Default Organization Resolver Service
**Type:** Enhancement  
**Priority:** High  
**Files:**
- Create `worker/services/DefaultOrganizationService.ts`
- Update `worker/constants.ts` (keep `DEFAULT_ORGANIZATION_ID` but make it configurable)

**Tasks:**
- [x] Create `DefaultOrganizationService.resolveDefaultOrg(userId?, context)`:
  - If `userId` provided → query Better Auth for `active_organization_id` from `sessions` table
  - If no active org or anonymous → return `DEFAULT_ORGANIZATION_ID`
  - Cache result in context
- [x] Create `DefaultOrganizationService.getPublicOrg()`:
  - Query `organizations` where `is_personal = 0` and config has `isPublic: true`
  - Cache result
- [x] Add environment variable `DEFAULT_PUBLIC_ORG_SLUG` (defaults to 'blawby-ai')

**Acceptance Criteria:**
- Service resolves org from Better Auth session
- Falls back to public org for anonymous
- Authenticated users default to their active org
- Public org resolution doesn't hardcode ID

---

### Issue #3: Parameterize Frontend Hooks (Consolidated on SessionProvider)
**Type:** Refactor  
**Priority:** High  
**Files:**
- `src/hooks/useChatSession.ts`
- `src/hooks/useMessageHandling.ts`
- `src/hooks/useFileUpload.ts`
- `src/hooks/useOrganizationConfig.ts`
- `src/contexts/SessionContext.tsx` (single source of truth)

**Tasks:**
- [x] Update hooks to accept `organizationId?: string` and resolve as: explicit param → `SessionProvider.activeOrganizationId` → `DEFAULT_ORGANIZATION_ID`.
- [x] Remove any dependency on custom org contexts or Better Auth org plugin client.
- [x] Ensure no hook performs its own session/org fetch; they read from `SessionProvider` only.

**Acceptance Criteria:**
- All hooks parameterized and default to `SessionProvider.activeOrganizationId`.
- No custom ActiveOrganization/Auth/Organization providers remain.
- No hardcoded `blawby-ai` defaults; anonymous falls back to `DEFAULT_ORGANIZATION_ID`.
- No redundant session/org fetching in hooks.

---

## Phase 2: Session Integration

### Issue #4: Bridge Better Auth Sessions with Chat Sessions
**Type:** Enhancement  
**Priority:** High  
**Files:**
- `worker/services/SessionService.ts`
- `worker/routes/agent.ts`
- `worker/routes/sessions.ts`

**Tasks:**
- [ ] Modify `SessionService.resolveSession()`:
  - Accept optional `userId` parameter
  - If `userId` provided and no `organizationId` in request:
    - Query Better Auth `sessions` table for `active_organization_id` where `user_id = userId`
    - Use `active_organization_id` as default org
  - Validate user has access to target org via `members` table
- [ ] Update agent route to extract `userId` from Better Auth context
- [ ] Pass `userId` to `SessionService.resolveSession()`
- [ ] Add org membership validation before session creation

**Acceptance Criteria:**
- Chat sessions respect Better Auth `active_organization_id`
- Anonymous users continue using public org
- Session creation validates org membership
- Better Auth session state drives chat org selection

---

### Issue #5: Add Organization Switching Support (Session-based)
**Type:** Feature  
**Priority:** Medium  
**Files:**
- Update `worker/routes/sessions.ts` (PATCH endpoint)
- `src/lib/authClient.ts` (`setActiveOrganization` helper)
- Create `src/components/OrganizationSwitcher.tsx`

**Tasks:**
- [x] Create `PATCH /api/sessions/organization` endpoint (no sessionId in path):
  - Validates membership and updates `sessions.active_organization_id`.
  - Returns `{ success: true }` and relies on client session revalidation.
- [x] Implement `setActiveOrganization(organizationId)` in `authClient` to call the endpoint and notify session store.
- [ ] Create `OrganizationSwitcher` dropdown that uses `setActiveOrganization`.
- [x] Ensure per-org chat sessions persist as they do today (no change in storage shape).
  
  > TODO: OrganizationSwitcher UI implementation is pending and will be completed in Phase 1 wrap-up.

**Acceptance Criteria:**
- Users can switch between their orgs via `setActiveOrganization`.
- Session updates (via revalidation) propagate `activeOrganizationId` to all consumers.
- Chat sessions preserved per org; UI shows current org with switcher.

---

## Phase 3: Conversation Abstraction (Reuse Existing Table)

### Issue #6: Activate Conversations Table
**Type:** Enhancement  
**Priority:** High  
**Files:**
- Create `worker/services/ConversationService.ts`
- Update `worker/schema.sql` (add indexes, no table changes)
- Create migration `20250X_activate_conversations_table.sql`

**Tasks:**
- [ ] Add indexes to `conversations` table:
  ```sql
  CREATE INDEX IF NOT EXISTS idx_conversations_org_status 
    ON conversations(organization_id, status);
  CREATE INDEX IF NOT EXISTS idx_conversations_session 
    ON conversations(session_id);
  ```
- [ ] Create `ConversationService` with methods:
  - `createConversation(sessionId, orgId, userId?, metadata?)`
  - `getConversations(sessionId, orgId)`
  - `updateConversationStatus(id, status)`
  - `archiveConversation(id)`
- [ ] Populate `user_info` JSON field with user data on creation
- [ ] Use `status` field: 'active', 'archived', 'completed'

**Acceptance Criteria:**
- `conversations` table actively used
- Indexes improve query performance
- Service manages conversation lifecycle
- Supports multiple conversations per session

---

### Issue #7: Link Messages to Conversations
**Type:** Refactor  
**Priority:** High  
**Files:**
- Update `worker/services/ChatService.ts` (create if doesn't exist)
- Update `worker/routes/agent.ts`
- Update migration `20250X_activate_conversations_table.sql`

**Tasks:**
- [ ] Create `ChatService` class with methods:
  - `createMessage(conversationId, sessionId, orgId, role, content, metadata?)`
  - `getMessages(conversationId, sessionId)`
  - `persistMessage()` - handles both tables
- [ ] Update `chat_messages` insertion to include `conversation_id` (field exists in schema line 36)
- [ ] Modify agent route to:
  - Get or create conversation before processing message
  - Pass conversationId to message persistence
- [ ] Add migration to backfill existing messages:
  ```sql
  -- Create default conversation per session
  INSERT INTO conversations (id, organization_id, session_id, status)
  SELECT 
    'conv_' || chat_sessions.id,
    chat_sessions.organization_id,
    chat_sessions.id,
    'active'
  FROM chat_sessions
  WHERE NOT EXISTS (
    SELECT 1 FROM conversations WHERE session_id = chat_sessions.id
  );
  
  -- Link existing messages to conversations
  UPDATE chat_messages
  SET conversation_id = 'conv_' || session_id
  WHERE conversation_id IS NULL;
  ```

**Acceptance Criteria:**
- Messages linked to both `session_id` and `conversation_id`
- Existing messages backfilled with default conversation
- Multiple conversations per session supported
- ChatService abstracts message persistence

---

### Issue #8: Add Conversation List Endpoints
**Type:** Feature  
**Priority:** Medium  
**Files:**
- Create `worker/routes/conversations.ts`
- Update `src/hooks/useConversations.ts` (create)

**Tasks:**
- [ ] Create conversation endpoints:
  - `GET /api/conversations?sessionId=&organizationId=` - List conversations
  - `POST /api/conversations` - Create new conversation
  - `PATCH /api/conversations/:id` - Update conversation (rename, archive)
  - `DELETE /api/conversations/:id` - Soft delete (set status='deleted')
- [ ] Add conversation metadata:
  - Auto-generate title from first messages (store in `user_info` JSON)
  - Track message count
  - Track last activity
- [ ] Create `useConversations` hook for frontend

**Acceptance Criteria:**
- Users can list conversations for a session
- Users can create new conversations
- Users can rename/archive conversations
- Conversation metadata tracked

---

## Phase 4: Decouple Chat from Agent

### Issue #9: Extract Chat Infrastructure from Agent Route
**Type:** Refactor  
**Priority:** High  
**Files:**
- Create `worker/routes/chat.ts`
- Update `worker/routes/agent.ts`
- Update `worker/services/ChatService.ts`

**Tasks:**
- [ ] Create `/api/chat` endpoint with operations:
  - `POST /api/chat/messages` - Send message (no agent invocation)
  - `GET /api/chat/messages?conversationId=` - Get messages
  - `POST /api/chat/conversations` - Create conversation
- [ ] Move message validation, persistence, streaming to `ChatService`
- [ ] Update agent route to use `ChatService` for message handling
- [ ] Add `requiresAgent` flag to message metadata
- [ ] Support human-only messages (no AI processing)

**Acceptance Criteria:**
- Chat works independently of agent
- Messages can be sent without AI processing
- Agent route uses `ChatService` for persistence
- `/api/chat` endpoint functional for basic chat

---

### Issue #10: Implement Agent Invocation Detection
**Type:** Feature  
**Priority:** High  
**Files:**
- Create `worker/services/AgentInvocationService.ts`
- Update `worker/routes/chat.ts`
- Update `worker/routes/agent.ts`

**Tasks:**
- [ ] Create `AgentInvocationService` with methods:
  - `shouldInvokeAgent(message, conversationContext)` - Heuristic detection
  - `parseAgentMention(message)` - Detect `@blawby`, `@agent` patterns
  - `routeToAgent(conversationId, message)` - Invoke agent
- [ ] Add agent mention detection in chat route:
  - Check message content for mentions
  - Check `requiresAgent` flag in request
  - Apply heuristics (complex queries, questions, etc.)
- [ ] Route to `/api/agent` if invocation needed
- [ ] Add `invocationType` to message metadata: 'manual' | 'auto' | 'none'

**Acceptance Criteria:**
- Users can tag agent with `@blawby`
- System detects complex queries needing agent
- Simple human messages bypass agent
- Invocation tracked in metadata

---

## Phase 5: Tool Registry & Permissions (No New Tables)

### Issue #11: Create In-Memory Tool Registry
**Type:** Enhancement  
**Priority:** High  
**Files:**
- Create `worker/tools/registry.ts`
- Create `worker/tools/types.ts`
- Create `worker/tools/base/BaseTool.ts`

**Tasks:**
- [ ] Define `Tool` interface:
  ```typescript
  interface Tool {
    name: string;
    description: string;
    category: string;
    execute(context: ToolContext): Promise<ToolResult>;
    checkPermissions(userId, orgId): Promise<boolean>;
    validateParams(params: unknown): boolean;
  }
  ```
- [ ] Create `ToolRegistry` class:
  - `register(tool: Tool)` - Add tool
  - `get(name: string)` - Get tool
  - `list(orgId, userId?)` - List available tools
- [ ] Create `BaseTool` abstract class with common logic
- [ ] Registry stored in-memory (no DB table needed)

**Acceptance Criteria:**
- Tool interface standardized
- Registry manages tool lifecycle
- Tools implement consistent interface
- No database changes required

---

### Issue #12: Implement Tool Permission Checks via Config
**Type:** Feature  
**Priority:** High  
**Files:**
- Create `worker/services/ToolPermissionService.ts`
- Update `worker/tools/base/BaseTool.ts`
- Update `worker/middleware/featureGuard.ts`

**Tasks:**
- [ ] Create `ToolPermissionService`:
  - `checkAccess(userId, orgId, toolName)` - Checks org config + member role
  - `getAvailableTools(userId, orgId)` - Lists permitted tools
  - `validateToolConfig(config)` - Validates tool config structure
- [ ] Integrate with `BaseTool.checkPermissions()`:
  - Query `organizations.config.tools[toolName]`
  - Check `enabled` flag
  - Check `requiredRole` against user's role in `members` table
  - Check `allowAnonymous` for anonymous users
- [ ] Extend feature guard to support tool checks:
  - Add `requireTool(toolName, options)` middleware
- [ ] Return 403 if permission denied

**Acceptance Criteria:**
- Permissions read from org config
- Role-based access enforced
- Anonymous access controlled
- Feature guard supports tools

---

### Issue #13: Integrate Tools with Usage Quotas
**Type:** Enhancement  
**Priority:** High  
**Files:**
- Update `worker/services/UsageService.ts`
- Update `worker/tools/base/BaseTool.ts`
- Update migration `20250X_extend_usage_quotas_metadata.sql`

**Tasks:**
- [ ] Extend `usage_quotas` tracking (no schema change needed):
  - Add tool usage to existing metrics via metadata pattern
  - Use `override_messages`/`override_files` for tool-specific limits
  - OR: Track tool usage in org config JSON (lighter approach)
- [ ] Add quota check in `BaseTool.execute()`:
  - Check tool's `quotaMetric` from org config
  - Call `UsageService.checkQuota(orgId, metric)`
  - Increment on success
- [ ] Create `TIER_LIMITS` extension for tool quotas:
  ```typescript
  tools: {
    pdf_analysis: { free: 5, plus: 50, business: -1, enterprise: -1 },
    lawyer_search: { free: 10, plus: 100, business: -1, enterprise: -1 }
  }
  ```
- [ ] Track tool usage in org dashboard (if needed)

**Acceptance Criteria:**
- Tool usage tracked per org
- Quota checked before execution
- Limits configurable per tier
- Works with existing quota system

---

### Issue #14: Migrate Existing Tools to Registry
**Type:** Refactor  
**Priority:** High  
**Files:**
- Create `worker/tools/analysis/PDFAnalysisTool.ts`
- Create `worker/tools/legal/CreateMatterTool.ts`
- Create `worker/tools/legal/SearchLawyersTool.ts`
- Create `worker/tools/legal/ContactFormTool.ts`
- Update `worker/middleware/fileAnalysisMiddleware.ts`
- Update `worker/agents/legal-intake/index.ts`

**Tasks:**
- [ ] Extract PDF analysis from middleware to `PDFAnalysisTool`:
  - Implement `BaseTool` interface
  - Add permission/quota checks
  - Support both middleware (auto) and direct invocation
- [ ] Extract agent tools to registry:
  - `CreateMatterTool`
  - `SearchLawyersTool`
  - `ContactFormTool`
  - `PaymentInvoiceTool`
- [ ] Update middleware to use tool registry
- [ ] Update agent to query registry for available tools
- [ ] Register all tools in `registry.ts` on worker startup

**Acceptance Criteria:**
- All tools use registry
- Tools implement standard interface
- Middleware uses tool registry
- Agent queries registry for tools
- Permission/quota applied to all tools

---

## Phase 6: Agent as Member System

### Issue #15: Create Agent System User
**Type:** Feature  
**Priority:** Medium  
**Files:**
- Create migration `20250X_create_blawby_agent_user.sql`
- Create `worker/services/AgentMemberService.ts`

**Tasks:**
- [ ] Create migration to seed agent user:
  ```sql
  INSERT OR IGNORE INTO users (id, email, name, email_verified, created_at, updated_at)
  VALUES (
    'blawby_agent_01',
    'agent@blawby.ai',
    'Blawby AI Agent',
    1,
    strftime('%s', 'now'),
    strftime('%s', 'now')
  );
  ```
- [ ] Add agent as member to blawby-ai org:
  ```sql
  INSERT OR IGNORE INTO members (id, organization_id, user_id, role, created_at)
  VALUES (
    'member_blawby_agent',
    '01K0TNGNKTM4Q0AG0XF0A8ST0Q',
    'blawby_agent_01',
    'agent',
    strftime('%s', 'now')
  );
  ```
- [ ] Create `AgentMemberService`:
  - `getAgentUser()` - Get agent user record
  - `isAgentMember(orgId)` - Check if agent is member
  - `addAgentToOrg(orgId, role?)` - Add agent to org
  - `removeAgentFromOrg(orgId)` - Remove agent from org

**Acceptance Criteria:**
- Agent user exists in `users` table
- Agent is member of blawby-ai org
- Role set to 'agent' (custom role)
- Service manages agent membership

---

### Issue #16: Implement Agent Tagging in Messages
**Type:** Feature  
**Priority:** High  
**Files:**
- Update `worker/services/AgentInvocationService.ts`
- Update `worker/routes/chat.ts`
- Update `src/components/MessageInput.tsx`

**Tasks:**
- [ ] Add mention parsing in `AgentInvocationService`:
  - Detect `@blawby`, `@agent`, `@<agent-name>` patterns
  - Extract mention from message content
  - Store mention in message metadata
- [ ] Update chat route to handle mentions:
  - Parse message for agent mentions
  - Route to agent if mentioned
  - Add `mentionedAgent: userId` to metadata
- [ ] Add agent presence indicator to UI:
  - Show "Blawby AI is available" if agent is member
  - Show "@blawby" autocomplete in message input
  - Highlight agent responses differently

**Acceptance Criteria:**
- Users can mention agent in messages
- Mentions trigger agent invocation
- UI shows agent presence
- Autocomplete suggests agent mention

---

### Issue #17: Multi-Org Agent Access
**Type:** Feature  
**Priority:** Medium  
**Files:**
- Create `worker/routes/agents.ts`
- Update `worker/services/AgentMemberService.ts`
- Create `src/components/AgentSettings.tsx`

**Tasks:**
- [ ] Create agent management endpoints:
  - `POST /api/organizations/:id/agents` - Add agent to org
  - `DELETE /api/organizations/:id/agents/:agentId` - Remove agent
  - `PATCH /api/organizations/:id/agents/:agentId` - Update agent config
- [ ] Update org config to support agent settings:
  ```json
  {
    "agentMember": {
      "enabled": true,
      "userId": "blawby_agent_01",
      "autoInvoke": false,
      "tagRequired": true,
      "allowedTools": ["pdf_analysis", "create_matter", "lawyer_search"]
    }
  }
  ```
- [ ] Create agent settings UI for org owners
- [ ] Validate tool permissions when agent invoked
- [ ] Support lawyer orgs adding blawby agent

**Acceptance Criteria:**
- Orgs can add/remove agent
- Agent permissions configurable per org
- Lawyer orgs can have agent assist
- Agent respects org-specific tool permissions

---

## Phase 7: User Flow Implementation

### Issue #18: Anonymous Chat with Quota (Already Works, Verify)
**Type:** Verification  
**Priority:** Low  
**Files:**
- `worker/routes/agent.ts` (verify feature guard)
- `worker/services/UsageService.ts` (verify public org limits)

**Tasks:**
- [ ] Verify anonymous users route to blawby-ai org
- [ ] Verify quota enforcement works
- [ ] Verify 402 response when quota exceeded
- [ ] Test anonymous session creation
- [ ] Document anonymous flow

**Acceptance Criteria:**
- Anonymous chat works up to quota
- Payment required response correct
- Session persists across page loads
- No breaking changes

---

### Issue #19: User Signup & Quota Increase
**Type:** Enhancement  
**Priority:** Medium  
**Files:**
- `worker/auth/index.ts` (session hooks)
- Update `worker/services/SessionMigrationService.ts`

**Tasks:**
- [ ] Update session creation hook to:
  - Migrate anonymous chat session to user's personal org
  - Call `SessionMigrationService.migrateSession()`
  - Update `chat_sessions.user_id`
  - Update `conversations.user_id`
- [ ] Verify personal org quota assignment
- [ ] Create welcome flow showing quota increase
- [ ] Preserve chat history during migration

**Acceptance Criteria:**
- Anonymous sessions migrate to personal org on signup
- Chat history preserved
- User sees increased quota
- Welcome message shown

---

### Issue #20: Matter Creation & Export
**Type:** Feature  
**Priority:** High  
**Files:**
- Update `worker/tools/legal/CreateMatterTool.ts`
- Create `worker/routes/matters.ts` (export endpoint)
- Create `src/components/MatterExport.tsx`

**Tasks:**
- [ ] Update `CreateMatterTool` to:
  - Save matter to user's personal org (not blawby-ai)
  - Link matter to conversation via metadata
  - Store blawby-ai assistance metadata
- [ ] Create matter export endpoint:
  - `GET /api/matters/:id/export?format=pdf` - Export matter as PDF
  - Use existing PDF generation utilities
  - Include conversation history if requested
- [ ] Add export UI to matter view
- [ ] Support multiple export formats (PDF, DOCX, JSON)

**Acceptance Criteria:**
- Matters saved to user's personal org
- Export generates PDF correctly
- Multiple formats supported
- Conversation linked to matter

---

### Issue #21: Lawyer Discovery & Matter Submission
**Type:** Feature  
**Priority:** High  
**Files:**
- Update `worker/tools/legal/SearchLawyersTool.ts`
- Create `worker/routes/submissions.ts`
- Create `src/components/LawyerMarketplace.tsx`

**Tasks:**
- [ ] Enhance `SearchLawyersTool`:
  - Query lawyers by practice area, location
  - Return lawyer orgs with profiles
  - Filter by blawby integration status
- [ ] Create matter submission flow:
  - `POST /api/matters/:id/submit` - Submit matter to lawyer org
  - Create conversation in lawyer org
  - Add user as participant
  - Notify lawyer org members
- [ ] Build lawyer marketplace UI:
  - Browse/search lawyers
  - View profiles
  - Submit matter for review
- [ ] Track submission status in matter metadata

**Acceptance Criteria:**
- Users can search lawyers
- Users can submit matters to lawyers
- Lawyer orgs receive submissions
- Submission creates conversation

---

### Issue #22: Lawyer-User Conversations with Agent
**Type:** Feature  
**Priority:** High  
**Files:**
- Update `worker/routes/conversations.ts`
- Update `worker/services/AgentInvocationService.ts`
- Create `src/components/LawyerConversationView.tsx`

**Tasks:**
- [ ] Enable multi-participant conversations:
  - Add participants array to `conversations.user_info` JSON
  - Support lawyer + user + agent in one conversation
  - Track participant roles
- [ ] Add agent to lawyer conversations:
  - Check if lawyer org has agent enabled
  - Add agent as participant if enabled
  - Allow manual invocation via mention
- [ ] Create lawyer conversation UI:
  - Show all participants
  - Indicate when agent responds
  - Allow agent tagging
  - Support handoff to agent
- [ ] Implement conversation permissions:
  - Validate user access via `members` table
  - Validate lawyer access via org membership
  - Agent respects org tool permissions

**Acceptance Criteria:**
- Lawyers can chat with users
- Agent available if org enabled
- Mentions trigger agent
- Permissions enforced
- UI shows all participants

---

## Phase 8: Cleanup & Documentation

### Issue #23: Remove/Update Hardcoded blawby-ai References
**Type:** Refactor  
**Priority:** Medium  
**Files:**
- All files with hardcoded `'blawby-ai'` references (26 files)

**Tasks:**
- [ ] Create const reference for default org:
  ```typescript
  export const DEFAULT_ORG = {
    get id() {
      return env.DEFAULT_PUBLIC_ORG_ID || '01K0TNGNKTM4Q0AG0XF0A8ST0Q';
    },
    get slug() {
      return env.DEFAULT_PUBLIC_ORG_SLUG || 'blawby-ai';
    }
  };
  ```
- [ ] Replace all hardcoded IDs with constant reference
- [ ] Update special case checks to use config instead of slug:
  - `worker/middleware/skipToLawyerMiddleware.ts:194` - Check org config, not slug
  - `worker/agents/legal-intake/index.ts:70` - Check org config
  - `worker/auth/index.ts:277` - Check `is_personal = 0` + config
- [ ] Remove unnecessary slug checks where org config is available

**Acceptance Criteria:**
- No hardcoded org IDs except in migrations
- Config-driven special case handling
- Environment variable support
- All tests passing

---

### Issue #24: Database Cleanup
**Type:** Maintenance  
**Priority:** Low  
**Files:**
- `worker/schema.sql`
- `worker/migrations/20250X_cleanup_unused_tables.sql`

**Tasks:**
- [ ] Decision: Keep or remove `messages` table (legacy)?
  - If unused: Create migration to drop
  - If used: Document usage
- [ ] Add missing indexes identified during development
- [ ] Add missing foreign key constraints:
  - `chat_sessions.organization_id` → `organizations.id`
  - `chat_messages.session_id` → `chat_sessions.id`
  - `chat_messages.organization_id` → `organizations.id`
  - `conversations.organization_id` → `organizations.id`
  - `conversations.session_id` → `chat_sessions.id`
- [ ] Enable `PRAGMA foreign_keys = ON` in worker initialization
- [ ] Document schema relationships

**Acceptance Criteria:**
- Unused tables removed or documented
- Foreign keys enforced
- Schema documented
- Performance validated

---

### Issue #25: Documentation
**Type:** Documentation  
**Priority:** Medium  
**Files:**
- Create `docs/architecture/multi-org-chat.md`
- Create `docs/architecture/tool-system.md`
- Create `docs/architecture/agent-system.md`
- Update `docs/organization-architecture.md`

**Tasks:**
- [ ] Document multi-org chat architecture
- [ ] Document tool registry and permissions
- [ ] Document agent member system
- [ ] Document conversation/thread model
- [ ] Create diagrams for data flow
- [ ] Document migration from v1 to v2
- [ ] Add API documentation

**Acceptance Criteria:**
- Architecture documented
- Migration guide written
- API documented
- Diagrams included

---

## Summary of Approach

**✅ Working Within Existing Schema:**
- Reusing `conversations` table (unused → active)
- Using `organizations.config` JSON for tool permissions (no new tables)
- Using `members` table for agent membership (no schema change)
- Using `usage_quotas` table for tool quotas (metadata pattern)
- Extending Better Auth `sessions.active_organization_id` integration

**✅ No New Tables Required:**
- Tool registry: In-memory + config
- Permissions: Org config JSON
- Agent system: Existing users + members tables
- Conversations: Existing table

**✅ Migration Strategy:**
- Minimal schema changes (indexes only)
- Backfill existing data into `conversations`
- Config migrations (update JSON fields)
- Incremental rollout per phase

**Estimated Effort:**
- Phase 1-2: 2-3 weeks (foundation)
- Phase 3-4: 2-3 weeks (conversations + chat decoupling)
- Phase 5: 2-3 weeks (tools)
- Phase 6: 1-2 weeks (agent system)
- Phase 7: 2-3 weeks (user flows)
- Phase 8: 1 week (cleanup)

**Total: ~12-15 weeks for complete refactor**

This plan works entirely within your existing Cloudflare Workers + D1 + Better Auth infrastructure, maximizing reuse and minimizing schema changes.