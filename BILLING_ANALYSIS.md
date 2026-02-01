# Billing & Matters Analysis: Transitioning to Retainer/Invoice Model

## 1. Executive Summary & Goals
**Goal**: Enable true retainer-style and invoice-style billing for practices using Stripe Connect. The system should function similarly to Upwork:
- **Hourly Work**: Works like a retainer. Client adds payment info, billed automatically or from a pre-paid balance as work is completed.
- **Project/Milestone/Contingency**: Escrow-style. Client pre-pays for a milestone; funds are held and released to the practice upon client approval of the work.

**Current Capabilities**:
- We have a robust **Stripe Connect** onboarding flow for practices.
- We have a basic **"Intake"** payment system (one-off charges via Stripe Payment Links).
- We have a **Matters** system that tracks time, expenses, and milestones but is **completely disconnected** from financial transactions.

**The Gap**: There is no "Financial Engine" linking the *Work* (Matters) to the *Money* (Stripe). We lack Invoices, Retainer Balances, and Escrow logic.

---

## 2. Current State Analysis

### A. Backend (`blawby-backend/src`)
The backend is modular but siloed regarding billing.

| Module | Location | Current Functionality |
|--------|----------|----------------------|
| **Matters** | `src/modules/matters` | Tracks `Matters`, `Milestones`, `TimeEntries`, `Expenses`. <br> **Limitation**: Purely record-keeping. No logic to trigger payments or generate invoices. |
| **Onboarding** | `src/modules/onboarding` | **Strong**. Handles Stripe Connect (Custom Accounts). <br> `services/connected-accounts.service.ts` correctly sets up `card_payments` and `transfers`. |
| **Intakes** | `src/modules/practice-client-intakes` | **Basic Payment**. Generates one-off Stripe Payment Links. <br> Uses **Destination Charges** (`transfer_data`). <br> **Limitation**: Not linked to Matters. One-time use only. |
| **Stripe** | `src/modules/stripe` | **Sync Only**. Syncs `Stripe Customer` <-> `User`. Does not handle active billing logic. |

### B. Frontend (`blawby-ai-chatbot/src`)
The frontend has UI for managing matters but lacks billing integration.

- **Matters UI**: `src/features/matters` displays milestones and time, but they are just data rows.
- **Billing UI**: Limited to "Stripe Onboarding" for the practice. No "Client Wallet" or "Invoice View" for the client.

---

## 3. Gap Analysis & Missing Primitives

### Gap 1: The "Invoice" Entity
We have no concept of an `Invoice` or `Transaction` record in the database linked to a Matter.
- **Need**: A `billing_invoices` table.
- **Function**: Aggregates Time Entries or Milestones into a payable record.

### Gap 2: Linkage (Work -> Pay)
- **Hourly**: `TimeEntry` creation is manual. There is no automated "Billing Run" to charge the client for approved hours.
- **Milestones**: `MatterMilestone` has an `amount`, but completing it does nothing in Stripe. It needs to trigger a "Release Funds" action.

### Gap 3: Escrow / Retainer Logic
- **Retainer**: We need a mechanism to hold client funds *before* work is done.
    - *Option A (Simple)*: Charge card -> Hold in Practice Stripe Balance -> Payout later.
    - *Option B (True Escrow)*: Hold in Platform Stripe Account -> Transfer to Practice Account upon approval.
- **Compliance**: "Holding in Escrow" implies specific legal/financial structures. Using Stripe's **Auth and Capture** (separate steps) or **Destination Charges** with manual payout timing is the technical implementation of this.

### Gap 4: Client Payment Methods
- Currently, `PracticeClientIntakes` uses Stripe Checkout (Payment Links), so we don't save the client's card for future use.
- **Goal**: We need to save `PaymentMethod` to the `Customer` so we can charge them for hourly work automatically (Retainer style).

---

## 4. Key File Paths & References

### Backend
- **Connect Logic**: `src/modules/onboarding/services/connected-accounts.service.ts`
    - *Reference for how we currently send money to practices.*
- **Matter Entities**: `src/modules/matters/database/schema/matters.schema.ts`
    - *Needs relation to Invoices.*
- **Milestone Logic**: `src/modules/matters/services/matter-milestones.service.ts`
    - *Needs "Payment Status" field (Pending Funding, Funded, Released).*
- **Intake Service**: `src/modules/practice-client-intakes/services/practice-client-intakes.service.ts`
    - *Reference for creating Destination Charges.*

### Frontend
- **Matter Types**: `src/shared/types/matter.ts`
- **Matter API**: `src/features/matters/services/mattersApi.ts`

---

## 5. Technical Implementation Plan Outline
*This section outlines the path forward for the implementation phase.*

### Phase 1: Foundation (Billing Module)
1.  **Create `src/modules/billing`**.
2.  **Schema**: Create `invoices` and `invoice_items` tables.
3.  **Link**: Add `stripe_customer_id` and `default_payment_method_id` to `customer_details`.

### Phase 2: Escrow / Milestone Billing
1.  **Milestone "Fund"**: When a milestone is active, create a PaymentIntent (Auth only or Capture to Platform).
2.  **Milestone "Release"**: When client approves, transfer funds to Connect Account.
3.  **Update Matter Service**: `createMatterMilestone` should trigger payment flow if "Pre-pay" is selected.

### Phase 3: Hourly / Retainer
1.  **Retainer Deposit**: Allow Practice to request a deposit (Invoice).
2.  **Auto-Charge**: Weekly job or "Invoice Now" button that aggregates unbilled Time Entries and charges the saved Payment Method.
