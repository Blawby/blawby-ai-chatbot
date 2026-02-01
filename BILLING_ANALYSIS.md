# Deep Analysis: Billing Architecture & Implementation Plan

## 1. Executive Summary
**Goal**: Enable "Upwork-style" billing where funds are held in Escrow (for Milestones) or billed against a Retainer (for Hourly work) before being released to the Practice.

**Strategy**:
1.  **Migrate** robust accounting logic (Invoices, Transfers) from the legacy `blawby-app`.
2.  **Build** a new `billing` module in `blawby-backend` to handle the "Hold & Release" lifecycle.
3.  **Implement** a client-facing "Wallet/Invoice" UI in `blawby-ai-chatbot`.

---

## 2. Migration: From Legacy (`blawby-app`)
*We are extracting established logic to ensure we don't reinvent the wheel.*

### **Logic to Extract & Port**
1.  **Core Invoice Logic** (`app/Services/StripeInvoiceService.php`)
    *   *Port to Backend*: The logic for `createStripeInvoice` (creating the Stripe object) and `createLocalInvoice` (saving to DB).
    *   *Why*: We need formal Invoices, not just simple charges, to support transparency and PDF generation.

2.  **Transfer Logic** (`app/Services/StripeTransfersService.php`)
    *   *Port to Backend*: The `transferInvoiceAmountToConnectedAccount` method.
    *   *Crucial*: This is the mechanism for **releasing funds** from Escrow (Platform) to the Lawyer (Connect Account).

3.  **Database Schema** (`database/migrations/*invoice*.php`)
    *   *Port to Backend*: `invoices` and `invoice_line_items` structure.
    *   *Adaptation*: Add `matter_id` to link invoices directly to legal implementation.

4.  **Webhook Handlers** (`app/Services/StripePaymentService.php`)
    *   *Port to Backend*: `handleInvoicePaidByCustomer`, `handleInvoicePaymentFailed`.

---

## 3. Backend Implementation (`blawby-backend`)
*Location: `/Users/paulchrisluke/Repos 2026/blawby-backend`*

### **A. New Module: `billing`**
Create a new directory: `src/modules/billing`.

**1. Database Schema (`src/modules/billing/database/schema`)**
*   **`invoices.schema.ts`**:
    *   `id`, `stripe_invoice_id`, `amount_due`, `status` (draft, open, paid, void), `customer_id`.
    *   **New Fields**: `matter_id` (FK), `milestone_id` (FK, nullable), `escrow_status` (held, released).
*   **`invoice_line_items.schema.ts`**:
    *   `details`, `amount`, `uom` (hours/fixed).
*   **`transactions.schema.ts`** (optional but recommended):
    *   To track the actual movement of funds (`stripe_transfer_id`, `amount`, `destination_account`).

**2. Services (`src/modules/billing/services`)**
*   **`invoices.service.ts`**:
    *   `createMilestoneInvoice(milestoneId)`: Generates an invoice for a specific milestone.
    *   `finalizeInvoice(invoiceId)`: Locks the invoice and sends it to Stripe.
*   **`escrow.service.ts`** (The "Engine"):
    *   `holdFunds(invoiceId)`: Verifies payment successful, marks DB as `funds_held`.
    *   `releaseFunds(invoiceId)`: Triggers Stripe Transfer to Connect Account, marks DB as `funds_released`.

**3. API Endpoints (`src/modules/billing/handlers`)**
*   `POST /api/billing/invoices/preview`: Calculate costs before commit.
*   `POST /api/billing/invoices`: Create an invoice (e.g., for a retainer deposit).
*   `POST /api/matters/:id/fund-milestone`: Specific endpoint to create an invoice for a milestone.
*   `POST /api/matters/:id/release-milestone`: (Lawyer requests, Client approves) -> Triggers release.

**4. Webhooks (`src/modules/webhooks`)**
*   **`invoice.paid`**:
    *   Update local invoice status.
    *   Update `MatterMilestone` status to `funded` (Ready for work).
    *   **Do NOT** auto-transfer funds yet.

---

## 4. Frontend Implementation (`blawby-ai-chatbot`)
*Location: `/Users/paulchrisluke/Repos2025/preact-cloudflare-intake-chatbot/blawby-ai-chatbot`*

### **A. Shared Data Layer**
1.  **Types** (`src/shared/types/billing.ts`):
    *   Define `Invoice`, `InvoiceLineItem`, `TransactionStatus`.
2.  **API Client**: Add methods to `apiClient` for fetching/paying invoices.

### **B. Feature: Billing (New Feature)**
Create `src/features/billing` for dedicated billing views.
1.  **`BillingOverview.tsx`**:
    *   Client view: Cards on file, Past Invoices, Escrow Balance.
    *   Practice view: Pending Transfers, Earnings.

### **C. Feature: Matters (Integration)**
Verify and update `src/features/matters` to integrate billing controls.

1.  **`ClientMatterDashboard.tsx`**:
    *   **Milestone List**: Add a "Status" column.
    *   **Action Button**:
        *   If `pending_funding` -> Show **"Fund Escrow"** button (Trigger Stripe Payment).
        *   If `work_completed` -> Show **"Approve & Release"** button.
    *   **Logic**: Hook up "Approve" button to call `POST /api/matters/:id/release-milestone`.

2.  **`PracticeMatterDashboard.tsx`**:
    *   Visible indicator: "Funds in Escrow" (Safe to work).
    *   "Request Release" button when dragging a milestone to "Done".

---

## 5. Summary of Workflow (The "Happy Path")

1.  **Contract**: Lawyer creates a Matter with Milestone 1 ($1000).
2.  **Funding (Client)**:
    *   Frontend: Client clicks "Fund Milestone 1".
    *   Backend: Creates Invoice -> Process Payment -> Holds $1000 in Platform.
    *   State: `Milestone: FUNDED`, `Invoice: PAID`, `Escrow: HELD`.
3.  **Work (Lawyer)**:
    *   Lawyer sees "Funded" status and does the work.
    *   Lawyer marks Milestone 1 as "Completed".
4.  **Approval (Client)**:
    *   Client reviews work. Clicks "Approve Release".
5.  **Release (System)**:
    *   Backend: Triggers `StripeTransfersService`. Holds 10% platform fee, sends $900 to Practice.
    *   State: `Milestone: COMPLETED`, `Escrow: RELEASED`.
