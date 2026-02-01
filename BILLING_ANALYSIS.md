# Deep Analysis: Billing Architecture & Implementation Plan

## 1. Executive Summary
**Goal**: Enable "Upwork-style" billing where funds are held in Escrow (for Milestones) or billed against a Retainer (for Hourly work) before being released to the Practice.

**Core Architecture**:
*   **Platform-as-Merchant**: The Platform collects funds from the Client -> Holds them -> Transfers to Practice upon approval.
*   **Infrastructure**: specialized `billing` module in `blawby-backend` orchestrating Stripe Invoices and Connect Transfers.

## 2. Technical Implementation Sequences

### A. Sequence: Milestone Escrow Flow (Fixed Price)
This flow describes the lifecycle of a discrete unit of work (Milestone) being funded, completed, and paid out.

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
This flow describes the continuous loop of replenishing a balance and drawing from it.

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

## 3. Migration: From Legacy (`blawby-app`)
*We are extracting established logic to ensure we don't reinvent the wheel.*

### **Logic to Extract & Port**
1.  **Core Invoice Logic** (`app/Services/StripeInvoiceService.php`)
    *   *Port to Backend*: `src/modules/billing/services/invoice.service.ts`
    *   *Source Method*: `createStripeInvoice` -> Adapting to TS/Drizzle.
    *   *Source Method*: `createLocalInvoice` -> Adapting to write to `invoices` table.

2.  **Transfer Logic** (`app/Services/StripeTransfersService.php`)
    *   *Port to Backend*: `src/modules/billing/services/payouts.service.ts`
    *   *Source Method*: `transferInvoiceAmountToConnectedAccount`
    *   *Role*: This is the `releaseFunds` engine in the Sequence Diagram (Phase 3).

3.  **Database Schema** (`database/migrations/2024_06_27_170448_create_invoice_table.php`)
    *   *Port to Backend*: `src/modules/billing/database/schema/invoices.schema.ts`
    *   *Additions*: `matter_id` (uuid), `milestone_id` (uuid), `escrow_status` (enum: pending, held, released).

---

## 4. Backend Implementation Plan (`blawby-backend`)

### **A. Module Structure: `src/modules/billing`**
This module is the "Financial Engine" connecting Matters (Work) to Stripe (Money).

**1. Database Schema**
*   **File**: `src/modules/billing/database/schema/invoices.schema.ts`
    *   `id`: uuid
    *   `stripe_invoice_id`: text (unique)
    *   `matter_id`: uuid (FK to matters.id)
    *   `amount_total`: integer (cents)
    *   `amount_platform_fee`: integer (cents)
    *   `status`: enum ('draft', 'open', 'paid', 'void')
    *   `escrow_status`: enum ('none', 'held', 'released')
*   **File**: `src/modules/billing/database/schema/transactions.schema.ts`
    *   `id`: uuid
    *   `invoice_id`: uuid (FK)
    *   `stripe_transfer_id`: text
    *   `amount`: integer
    *   `destination_account_id`: text

**2. Services**
*   **File**: `src/modules/billing/services/invoice-generator.service.ts`
    *   `generateMilestoneInvoice(milestoneId)`: Creates Stripe Invoice Item + Invoice.
*   **File**: `src/modules/billing/services/escrow.service.ts`
    *   `releaseFunds(invoiceId)`:
        1. Checks `escrow_status` == 'held'
        2. Calculates payout (Total - Fee)
        3. Calls `stripe.transfers.create`
        4. Updates DB to `released`.

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

## 6. Security & Compliance Notes
*   **Funds Flow**: We are using separate Charges and Transfers. This means funds technically reside in the Platform's Stripe Balance during the "Escrow" period.
*   **Compliance**: Ensure Terms of Service clarify that BLawby acts as a limited payment agent.
*   **Idempotency**: All `Transfer` calls must use `idempotency_key` based on the `invoice_id` to prevent double-payouts.
