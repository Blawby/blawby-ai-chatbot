<!-- 10f4ec3a-3c7a-45ed-805e-de0c17853d96 144e908d-0f30-4245-8423-27caaa08e154 -->
# Align Organization System with Better Auth

## Problem

Currently inefficient organization handling:

- Fetching ALL organizations on root instead of just the active one
- Not using Better Auth's active organization system properly
- Schemas don't match Better Auth's expectations for Cloudflare/Drizzle
- `get-full-organization` returns 401 because `activeOrganizationId` isn't set in session

## Goal

- Use Better Auth's active organization pattern (fetch by ID, not all orgs)
- Align Drizzle schemas with Better Auth's expectations
- Set personal organization as active on login
- Remove inefficient "fetch all orgs" calls from root

## Implementation

### 1. Fix Database Schema - Add Missing Columns

**File: `worker/schema.sql`**

Add `active_organization_id` to sessions table:

```sql
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,
  created_at INTEGER DEFAULT (strftime('%s', 'now')) NOT NULL,
  updated_at INTEGER DEFAULT (strftime('%s', 'now')) NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  user_id TEXT NOT NULL,
  active_organization_id TEXT  -- ADD THIS
);
```

Run migration:

```bash
wrangler d1 execute DB --local --file=worker/schema.sql
```

### 2. Update Drizzle Schema to Match Better Auth

**File: `worker/db/auth.schema.ts`**

Add `activeOrganizationId` to sessions:

```typescript
export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  activeOrganizationId: text("active_organization_id"),  // ADD THIS
});
```

Add `invitations` table (Better Auth organization plugin needs this):

```typescript
export const invitations = sqliteTable("invitations", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: text("role").notNull(),
  status: text("status").default("pending"),
  invitedBy: text("invited_by")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (table) => ({
  invitationEmailIdx: index("invitation_email_idx").on(table.email),
  invitationOrgIdx: index("invitation_org_idx").on(table.organizationId),
}));
```

Export the invitations table in the schema object:

```typescript
export const authSchema = {
  users,
  sessions,
  accounts,
  verifications,
  organizations,
  members,
  invitations,  // ADD THIS
};
```

### 3. Switch Better Auth to Drizzle Adapter

**File: `worker/auth/index.ts`**

Find the Better Auth configuration (around line 750):

```typescript
authInstance = betterAuth({
  ...withCloudflare({
    d1: env.DB,  // REMOVE THIS
```

Replace with Drizzle adapter:

```typescript
authInstance = betterAuth({
  ...withCloudflare({
    drizzle: {  // USE DRIZZLE INSTEAD
      db,
      schema: authSchema,
    },
```

This gives Better Auth access to all schema tables including invitations.

### 4. Set Personal Org as Active After Creation

**File: `worker/auth/hooks.ts`**

Update `handlePostSignup` to set the personal org as active:

```typescript
export async function handlePostSignup(
  userId: string,
  userName: string,
  env: Env
): Promise<void> {
  try {
    // Wait for session to be ready
    await waitForSessionReady(userId, env);
    
    // Create personal organization
    await createPersonalOrganizationOnSignup(userId, userName, env);
    
    // Set personal org as active in the session
    const organizationService = new OrganizationService(env);
    const organizations = await organizationService.listOrganizations(userId);
    const personalOrg = organizations.find(org => org.isPersonal);
    
    if (personalOrg) {
      // Get the session token for this user
      const session = await env.DB.prepare(
        `SELECT token FROM sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`
      ).bind(userId).first<{ token: string }>();
      
      if (session?.token) {
        // Update the session with active organization
        await env.DB.prepare(
          `UPDATE sessions SET active_organization_id = ?, updated_at = ? WHERE token = ?`
        ).bind(personalOrg.id, Math.floor(Date.now() / 1000), session.token).run();
        
        console.log(`✅ Set personal org ${personalOrg.id} as active for user ${userId}`);
      }
    }
  } catch (error) {
    console.error(`❌ Failed to handle post-signup for user ${userId}:`, error);
  }
}
```

### 5. Frontend: Use Active Organization Efficiently

**File: `src/contexts/SessionContext.tsx`**

Instead of fetching ALL organizations, use Better Auth's `useActiveOrganization`:

```typescript
import { authClient } from '../lib/authClient';

export function SessionProvider({ children }: { children: ComponentChildren }) {
  const { data: sessionData } = authClient.useSession();
  const activeOrganization = authClient.useActiveOrganization(); // Fetches by ID only
  const { organizationId: organizationSlug } = useOrganization();

  // Active organization from Better Auth (efficient - fetches by ID)
  const activeOrg = activeOrganization?.data?.organization || null;
  const activeOrgId = activeOrganization?.data?.organization?.id || null;
  
  // ... rest of the code
  
  const value = useMemo<SessionContextValue>(() => ({
    session: sessionData ?? null,
    isAnonymous: !sessionData?.user,
    activeOrganizationId: activeOrgId,
    activeOrganizationSlug: organizationSlug ?? null,
    activeOrganization: activeOrg, // Add this
    quota,
    quotaLoading,
    quotaError,
    refreshQuota: fetchQuota,
  }), [sessionData, activeOrgId, organizationSlug, activeOrg, quota, quotaLoading, quotaError, fetchQuota]);
  
  return (
    <SessionContext.Provider value={value}>
      {children}
    </SessionContext.Provider>
  );
}
```

**File: `src/index.tsx`**

Remove the inefficient "fetch all orgs" from root:

```typescript
// BEFORE (inefficient - fetches ALL orgs):
const { organizations, currentOrganization } = useOrganizationManagement();

// AFTER (efficient - only active org):
const activeOrganization = authClient.useActiveOrganization();
const currentUserTier = activeOrganization?.data?.organization?.subscriptionTier || 'free';
```

### 6. Only Fetch All Orgs When Needed

**File: `src/hooks/useOrganizationManagement.ts`**

Keep the ability to fetch all organizations, but only when explicitly needed (e.g., in organization settings page):

```typescript
// Only call this when user explicitly needs to see all orgs (settings page)
const fetchOrganizations = useCallback(async () => {
  if (!session?.user) return;
  
  const response = await fetch('/api/organizations/me', {
    credentials: 'include'
  });
  
  if (response.ok) {
    const { data } = await response.json();
    setOrganizations(data || []);
  }
}, [session?.user]);
```

### 7. Set Active Org on Login (Frontend Fallback)

**File: `src/contexts/SessionContext.tsx`**

Add effect to ensure active org is set after login:

```typescript
useEffect(() => {
  const ensureActiveOrg = async () => {
    if (!sessionData?.user) return;
    
    // Check if active org is already set
    if (activeOrganization?.data?.organization) return;
    
    // Fetch user's organizations
    const response = await fetch('/api/organizations/me', { credentials: 'include' });
    if (!response.ok) return;
    
    const { data: orgs } = await response.json();
    const personalOrg = orgs?.find((org: any) => org.isPersonal);
    
    if (personalOrg) {
      // Set personal org as active via Better Auth
      await authClient.organization.setActive({
        organizationId: personalOrg.id
      });
    }
  };
  
  ensureActiveOrg();
}, [sessionData?.user, activeOrganization?.data]);
```

## Benefits

1. ✅ Efficient - only fetches active organization by ID (not all orgs)
2. ✅ Aligned with Better Auth patterns and documentation
3. ✅ Properly uses session's `activeOrganizationId`
4. ✅ `get-full-organization` will return 200 with org data
5. ✅ Schemas match Better Auth's expectations for Drizzle
6. ✅ Personal org automatically set as active on signup/login

### To-dos

- [ ] Add userOrganizations state and fetchUserOrganizations function to SessionContext, integrate Better Auth setActiveOrganization on login
- [ ] Update useOrganizationManagement to remove auto-fetch, use Better Auth setActiveOrganization for switching, remove currentOrganization state
- [ ] Remove useOrganizationManagement call from MainApp component in src/index.tsx, derive subscriptionTier from useActiveOrganization instead
- [ ] Update all components using currentOrganization to use Better Auth useActiveOrganization hook instead
- [ ] Test anonymous (blawby-ai) and authenticated (personal org) user flows to ensure proper org context