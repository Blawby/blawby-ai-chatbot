# Deep Analysis: Billing Architecture & Implementation Plan

## 1. Executive Summary
**Goal**: Enable "Upwork-style" billing where funds are held in Escrow (for Milestones) or billed against a Retainer (for Hourly work) before being released to the Practice.

**Core Architecture**:
*   **Platform-as-Merchant**: The Platform collects funds from the Client -> Holds them -> Transfers to Practice upon approval.
*   **Infrastructure**: specialized `billing` module in `blawby-backend` orchestrating Stripe Invoices and Connect Transfers.

## 2. Technical Context & Findings (New)

### A. Backend Architecture (`blawby-backend`)
*   **Structure**: `src/modules/{module_name}` (e.g., `matters`, `onboarding`).
*   **ORM**: Drizzle.
*   **Schema Gap**: The `matters` table (`src/modules/matters/database/schema/matters.schema.ts`) has `billing_type` but **MISSING** `retainer_balance`. We must add this.
*   **Stripe**: `StripeConnectedAccount` logic is robust (`onboarding` module). We can leverage the existing `stripe` client export.

### B. Legacy Migration (`blawby-app`)
*   **Invoice Schema**: `invoices` table is clean. We will reproduce it in `billing` module with an added `matter_id` foreign key.
*   **Logic**: `StripeInvoiceService.php` uses `on_behalf_of` for invoices. We will adopt this to ensure the Practice is the Merchant of Record for tax purposes, even if Platform holds funds temporarily.

### C. Frontend (`blawby-ai-chatbot`)
*   **API**: `src/shared/lib/apiClient.ts` is robust. We will extend it with a `Billing` namespace.
*   **Tech**: Preact. Integration with `@stripe/stripe-js` (Payment Element) is required for the "Fund Milestone" modal.

---

## 3. Technical Implementation Sequences

### A. Sequence: Milestone Escrow Flow (Fixed Price)

```mermaid
sequenceDiagram
    participant Client as Client User
    participant Practice as Practice User
    participant FE as Frontend (blawby-ai-chatbot)
    participant API as Backend API (blawby-backend)
    participant DB as Postgres DB
    participant Stripe as Stripe API

    Note over Client, Stripe: Phase 1: Funding (Escrow Deposit)
    
    Client->>FE: Click "Fund Milestone" ($1,000)
    FE->>API: POST /api/billing/invoices
    Note right of FE: Payload: { matter_id: "...", milestone_id: "...", details: "Phase 1" }
    
    API->>Stripe: stripe.customers.create (if new)
    API->>Stripe: stripe.invoices.createItem({ amount: 100000, currency: "usd" })
    API->>Stripe: stripe.invoices.create({ collection_method: "send_invoice", days_until_due: 0 })
    API->>Stripe: stripe.invoices.finalizeInvoice(invoice_id)
    
    Stripe-->>API: Returns Invoice Object (status: open, payment_intent: "pi_123")
    
    API->>DB: INSERT into "invoices" (status: "open", escrow_status: "held")
    API->>DB: INSERT into "invoice_line_items"
    
    API-->>FE: Return { client_secret: "pi_123_secret", invoice_id: "..." }
    
    FE->>Stripe: stripe.confirmPayment(client_secret)
    Note right of FE: Uses Stripe Payment Element
    
    Stripe-->>FE: Payment Succeeded
    Stripe->>API: Webhook: invoice.paid
    
    API->>DB: UPDATE "invoices" SET status = "paid"
    API->>DB: UPDATE "matter_milestones" SET status = "funded"
    Note right of API: Funds now sitting in Platform Stripe Balance

    Note over Client, Stripe: Phase 2: Work & Approval
    
    Practice->>FE: Mark Milestone "Completed"
    FE->>API: PATCH /api/matters/:id/milestones/:id
    API->>DB: UPDATE "matter_milestones" SET status = "completed"
    
    Client->>FE: Review Work -> Click "Approve & Release"
    FE->>API: POST /api/billing/release-funds
    Note right of FE: Payload: { milestone_id: "..." }

    Note over Client, Stripe: Phase 3: Payout (Release)

    API->>DB: SELECT * FROM invoices WHERE milestone_id = "..." AND status = "paid"
    
    API->>Stripe: stripe.transfers.create({ amount: 90000, destination: "acct_connect_id" })
    Note right of API: $1,000 Total - 10% Platform Fee = $900 Payout
    
    Stripe-->>API: Transfer Object (id: "tr_456")
    
    API->>DB: INSERT into "transactions" (type: "payout", amount: 90000)
    API->>DB: UPDATE "matter_milestones" SET status = "released"
    
    API-->>FE: Success (Funds Released)
```

### B. Sequence: Hourly Retainer Draw

```mermaid
sequenceDiagram
    participant Client
    participant Practice
    participant FE as Frontend
    participant API as Backend API
    participant DB as Database
    participant Stripe

    Note over Client, Stripe: Phase 1: Retainer Deposit
    
    Practice->>FE: Send Retainer Request ($2,000)
    FE->>API: POST /api/billing/retainers
    
    API->>Stripe: create Invoice + Finalize
    API->>DB: Create Invoice (type: "retainer")
    
    Client->>FE: Pay Retainer Invoice
    FE->>Stripe: Confirm Payment
    Stripe->>API: Webhook: invoice.paid
    
    API->>DB: UPDATE "invoices" SET status = "paid"
    API->>DB: UPDATE "matters" SET retainer_balance = retainer_balance + 200000
    
    Note over Client, Stripe: Phase 2: Billing Hours (The Draw)
    
    Practice->>FE: Log 2 Hours ($500)
    FE->>API: POST /api/matters/:id/time-entries
    
    API->>DB: INSERT "time_entries"
    
    Practice->>FE: Click "Process Billing" (Weekly/Manual)
    FE->>API: POST /api/billing/process-draw
    
    API->>DB: Check retainer_balance >= 50000?
    
    alt Sufficient Funds
        API->>DB: UPDATE "matters" SET retainer_balance = retainer_balance - 50000
        API->>Stripe: stripe.transfers.create({ amount: 45000, destination: "acct_..." })
        Note right of API: 10% Platform Fee deducted
        API->>DB: Mark time_entries as "billed"
        API-->>FE: Success
    else Insufficient Funds
        API-->>FE: Error "Insufficient Retainer Balance"
        API->>FE: Trigger "Request Replenishment" flow
    end
```

---

## 4. Backend Implementation Plan (`blawby-backend`)

### **A. Module Structure: `src/modules/billing`**
This module is the "Financial Engine" connecting Matters (Work) to Stripe (Money). The structure follows the existing `matters` module pattern.

```text
src/modules/billing/
├── database/
│   └── schema/
│       ├── invoices.schema.ts
│       └── transactions.schema.ts
├── services/
│   ├── invoice-generator.service.ts
│   └── escrow.service.ts
├── validations/
│   └── billing.validation.ts
├── routes.ts (OpenAPI definition)
├── handlers.ts (Implementation)
├── http.ts (Hono App)
└── index.ts
```

**1. Database Schema Specifications (Drizzle)**

*   **File**: `src/modules/matters/database/schema/matters.schema.ts`
```typescript
// Add to 'matters' table definition:
retainer_balance: integer('retainer_balance').default(0).notNull(), // Stores amount in cents
```

*   **File**: `src/modules/billing/database/schema/invoices.schema.ts` (New)
```typescript
import { pgTable, uuid, text, integer, varchar, timestamp } from 'drizzle-orm/pg-core';
import { organizations } from '@/schema';
import { matters } from '@/modules/matters/database/schema/matters.schema';
import { matterMilestones } from '@/modules/matters/database/schema/matter-milestones.schema'; // Ensure exported
import { userDetailsSchema } from '@/modules/user-details/database/schema/user-details.schema';
// Note: Imports may need adjustment based on exact file locations.

const { userDetails } = userDetailsSchema;

export const invoices = pgTable('invoices', {
  id: uuid('id').primaryKey().defaultRandom(),
  stripe_invoice_id: text('stripe_invoice_id').unique().notNull(),

  // Foreign Keys
  organization_id: uuid('organization_id').references(() => organizations.id).notNull(),
  matter_id: uuid('matter_id').references(() => matters.id).notNull(),
  milestone_id: uuid('milestone_id').references(() => matterMilestones.id), // Nullable
  customer_id: uuid('customer_id').references(() => userDetails.id).notNull(),

  // Financials
  amount_due: integer('amount_due').notNull(),
  amount_paid: integer('amount_paid').default(0).notNull(),
  amount_remaining: integer('amount_remaining').notNull(),
  currency: varchar('currency', { length: 3 }).default('usd').notNull(),
  application_fee_amount: integer('application_fee_amount').default(0),

  // Status & Meta
  status: varchar('status', { length: 20 }).default('draft').notNull(), // 'draft', 'open', 'paid', 'void'
  escrow_status: varchar('escrow_status', { length: 20 }).default('none'), // 'none', 'held', 'released'
  invoice_type: varchar('invoice_type', { length: 20 }).notNull(), // 'milestone', 'retainer'

  // Timestamps
  due_date: timestamp('due_date', { withTimezone: true, mode: 'date' }),
  paid_at: timestamp('paid_at', { withTimezone: true, mode: 'date' }),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
});
```

*   **File**: `src/modules/billing/database/schema/transactions.schema.ts` (New)
```typescript
import { pgTable, uuid, text, integer, varchar, timestamp } from 'drizzle-orm/pg-core';
import { invoices } from './invoices.schema';

export const transactions = pgTable('billing_transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  invoice_id: uuid('invoice_id').references(() => invoices.id),
  stripe_transfer_id: text('stripe_transfer_id').notNull(),
  amount: integer('amount').notNull(), // in cents
  destination_account_id: text('destination_account_id').notNull(),
  type: varchar('type', { length: 20 }).default('payout').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
});
```

**2. Services Strategy**
*   **Stripe Client**: Use existing `import { stripe } from '@/shared/utils/stripe-client';`.
*   **Pattern**: Use async/await for all Stripe calls.
*   **Response Wrapping**: Handlers should return `response.ok(c, { result })` or `response.created(c, { result })` to match existing `responseUtils`.
*   **Auth**: Use `const user = c.get('user')!;` to get authenticated user in handlers.

**3. API Handlers**
*   `POST /api/billing/milestones/:id/fund`: Triggers Invoice creation.
    *   *Returns*: `{ client_secret, invoice_id }` for Frontend Stripe Element.
*   `POST /api/billing/milestones/:id/release`: Triggers Escrow release.
    *   *Requires*: Active Session User == Client of the Matter.

---

## 5. Frontend Implementation Plan (`blawby-ai-chatbot`)

### **A. API Integration**
*   **File**: `src/shared/lib/apiClient.ts`
    *   Add `billing` namespace methods: `fundMilestone`, `releaseMilestone`, `getInvoices`.

### **B. Components**
1.  **FundMilestoneModal.tsx** (`src/features/billing/components/`)
    *   Input: `milestone` object.
    *   Content: Summarizes cost + Stripe `PaymentElement`.
    *   Action: Calls `api.billing.fundMilestone`, handles confirmation.

2.  **MilestoneActionRow.tsx** (`src/features/matters/components/`)
    *   *State Logic*:
        *   `status === 'pending_funding'` -> Render **<Button>Fund Escrow</Button>**
        *   `status === 'funded'` -> Render **<Badge>Funds Secured</Badge>**
        *   `status === 'completed' && isClient` -> Render **<Button>Approve & Pay</Button>**

---

## 6. Business Logic Decisions
*   **Platform Fee**: 10% (Fixed for MVP).
*   **Escrow Holding**: **Direct Charge** to Platform. Funds are held in Platform Balance.
*   **Release Mechanism**: **Client Approval**. Client must explicitly approve work to trigger the `Transfer` to the Practice.
*   **Retainer Draw**: **Manual-Triggered** or Weekly Batch. (MVP: Manual "Process Draw" button for Practice).
