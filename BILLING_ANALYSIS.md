# Deep Analysis: Billing Architecture & Migration Plan

## 1. Executive Summary
**Current Status**: The new `blawby-backend` has solid scaffolding for **Stripe Connect Custom Accounts** (Onboarding) and simple **Direct Charges** (Intakes). However, it lacks the "Middle Layer" required for an Upwork-style platform: **Invoices**, **Held Funds (Escrow)**, and **Retainer Logic**.

**Legacy Asset**: The `blawby-app` (Legacy) contains a mature `Invoice` engine (`StripeInvoiceService`) and `Transfer` logic (`StripeTransfersService`) that perfectly models the **Platform-to-Connect** fund flow we need.

**The Solution**: We will migrate the **Data Model** and **Service Logic** from `blawby-app` to `blawby-backend`, adapting it to support "Escrow" (Holding funds before transfer) vs. "Retainer" (Direct billing).

---

## 2. Architecture Comparison

### A. Fund Flow Models

| Feature | Legacy (`blawby-app`) | Current (`blawby-backend`) | **Target Goal (Upwork Style)** |
| :--- | :--- | :--- | :--- |
| **Charge Model** | **Platform Charge** w/ `on_behalf_of` | **Direct Charge** (Payment Links) | **Hybrid**: Platform Charge (Escrow) & Direct Transfer |
| **Invoicing** | Robust `invoices` table + Stripe Invoice Sync | None (One-off charges only) | **Full Invoicing** (synced with Matter milestones) |
| **Payouts** | Manual `StripeTransfersService` | Auto (`transfer_data` in Payment Link) | **Conditional**: Auto for Retainer, Manual Release for Escrow |
| **Merchant of Record**| Connected Account (mostly) | Connected Account | Connected Account (via `on_behalf_of`) |

### B. Schema Gap Analysis

We have a significant schema gap. We must port these tables from Legacy to Current.

**1. `invoices` Table**
*   **Legacy**: `id`, `customer_id`, `stripe_invoice_id`, `amount_due`, `amount_paid`, `status`, `application_fee`, `invoice_type` ('team'/'customer').
*   **New Requirement**: Add `matter_id` (FK) and `milestone_id` (FK optional) to link Financials to Work.

**2. `invoice_line_items` Table**
*   **Legacy**: `description`, `quantity`, `unit_price`, `line_total`.
*   **New Requirement**: Add `time_entry_id` or `milestone_id` to link specific work items to the line item.

**3. `paid_invoice_payout_transfers` Table**
*   **Legacy**: Tracks the `stripe_transfer_id` linked to an Invoice.
*   **Critical for Escrow**: This is the audit trail proving funds were released to the lawyer.

---

## 3. Migration Plan: "Legacy" to "Current"

### Step 1: Create `billing` Module
**Location**: `src/modules/billing`
This will house the logic currently scattered or missing.

### Step 2: Port Database Schema
**Source**: `blawby-app/database/migrations/*_create_invoice_table.php`
**Destination**: `blawby-backend/src/modules/billing/database/schema/invoices.schema.ts`
*   Define `invoices` table (Drizzle).
*   Define `invoice_line_items` table (Drizzle).
*   Define `invoice_transfers` table (Drizzle).

### Step 3: Implemenet "Escrow" Service Logic
**Source**: `blawby-app/app/Services/StripeInvoiceService.php` methods `createStripeInvoice`, `handleInvoicePaidByCustomer`.

**Logic Adaptation**:
1.  **Milestone Funding (Pre-pay)**:
    *   User clicks "Fund Milestone".
    *   Backend creates `Invoice` (Draft).
    *   Backend calls `StripeInvoiceService.finalizeInvoice`.
    *   **Crucial Change**: DO NOT auto-transfer. The funds settle in the **Platform Stripe Balance**.
    *   Update `MatterMilestone` status to `funded`.

2.  **Work Completion**:
    *   Lawyer marks Milestone as `completed`.
    *   Client reviews and clicks "Approve".

3.  **Fund Release (The Transfer)**:
    *   **Source**: `blawby-app/app/Services/StripeTransfersService.php` (`transferInvoiceAmountToConnectedAccount`).
    *   Backend triggers `stripe.transfers.create({ amount, destination: practice_account_id })`.
    *   Update `MatterMilestone` status to `paid`.

### Step 4: Implement "Retainer/Hourly" Logic
**New Logic**: The Legacy app didn't fully implement "Retainer" balances, but the *mechanism* is the same as Escrow, just faster.
*   **Retainer Deposit**: Create Invoice -> Client Pays -> Hold in Platform.
*   **Hourly Work**: Lawyer logs time -> "Bill Against Retainer".
*   **System Action**: Deduct from virtual "Retainer Balance" -> Trigger `Stripe Transfer` to practice.

---

## 4. Specific File Migration Candidates

| Legacy File (Source) | Logic to Extract | Destination (New) |
| :--- | :--- | :--- |
| `StripeInvoiceService.php` | `createStripeInvoice` | `modules/billing/services/invoice-generator.service.ts` |
| `StripeInvoiceService.php` | `handleInvoicePaidByCustomer` | `modules/webhooks/services/invoice-webhooks.service.ts` |
| `StripeTransfersService.php` | `transferInvoiceAmountToConnectedAccount` | `modules/billing/services/payouts.service.ts` |
| `Invoice.php` (Model) | Schema Structure | `modules/billing/database/schema/invoices.schema.ts` |

---

## 5. Webhook Requirements
The current `blawby-backend` only handles `onboarding` and `intakes`. We need to register and handle:
1.  `invoice.paid`: Mark local invoice as paid. Update Milestone to `funded`.
2.  `invoice.payment_failed`: Notify user.
3.  `payment_intent.succeeded`: (Fallback if not using Invoices objects for retainers).

## 6. Frontend Implications (`blawby-ai-chatbot`)
We need to build a **"Billing & Invoices"** tab in the Matter View.
*   **Client View**: List of Invoices (Paid/unpaid). "Fund Milestone" button.
*   **Practice View**: "Invoices" list. Status of funds (Escrow vs Released).
*   **API Needs**: `GET /api/matters/:id/invoices`, `POST /api/invoices/:id/pay`.

---

## 7. Immediate Next Steps (Implementation Order)
1.  **Schema**: Create Drizzle schemas for Invoices in `blawby-backend`.
2.  **Service**: Port `StripeInvoiceService` logic to TypeScript.
3.  **Webhook**: Add `invoice.paid` listener.
4.  **Escrow Hook**: Link `Milestone` "Fund" button to `Invoice` creation.
