/**
 * Wire types for Invoice resources — backend HTTP contract.
 *
 * snake_case fields, exactly matching the backend at
 * `BACKEND_API_URL` (staging-api.blawby.com / production-api.blawby.com).
 *
 * Frontend code imports these via `@/shared/types/wire`.
 * Worker code imports directly from this module.
 */

export type BackendInvoiceLineItem = {
  id?: string;
  type?: string;
  description?: string;
  quantity?: number;
  unit_price?: number;
  line_total?: number;
  time_entry_id?: string | null;
  expense_id?: string | null;
  sort_order?: number;
};

export type BackendInvoice = {
  id: string;
  organization_id: string;
  client_id: string;
  matter_id?: string | null;
  connected_account_id: string;
  invoice_number?: string | null;
  stripe_invoice_id?: string | null;
  stripe_invoice_number?: string | null;
  stripe_charge_id?: string | null;
  stripe_transfer_id?: string | null;
  stripe_payment_intent_id?: string | null;
  stripe_hosted_invoice_url?: string | null;
  invoice_type?: string | null;
  status?: string | null;
  subtotal?: number | null;
  tax_amount?: number | null;
  discount_amount?: number | null;
  total?: number | null;
  amount_paid?: number | null;
  amount_due?: number | null;
  fund_destination?: string | null;
  payment_from_retainer?: boolean | null;
  issue_date?: string | Date | null;
  due_date?: string | Date | null;
  paid_at?: string | Date | null;
  notes?: string | null;
  memo?: string | null;
  created_at?: string | Date | null;
  updated_at?: string | Date | null;
  line_items?: BackendInvoiceLineItem[] | null;
  lineItems?: BackendInvoiceLineItem[] | null;
  client?: Record<string, unknown> | null;
  matter?: Record<string, unknown> | null;
  connectedAccount?: Record<string, unknown> | null;
};
