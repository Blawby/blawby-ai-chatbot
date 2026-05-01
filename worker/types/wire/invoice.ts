/**
 * Wire types for Invoice resources — backend HTTP contract.
 *
 * snake_case fields, exactly matching the backend at
 * `BACKEND_API_URL` (staging-api.blawby.com / production-api.blawby.com).
 *
 * Each TS type is derived from a Zod schema so runtime validation and
 * the static type stay in lockstep.
 */

import { z } from 'zod';

const nullableString = () => z.string().nullable().optional();
const nullableNumber = () => z.number().nullable().optional();
const nullableBoolean = () => z.boolean().nullable().optional();
const nullableDate = () => z.union([z.string(), z.date()]).nullable().optional();

export const BackendInvoiceLineItemSchema = z.object({
  id: z.string().optional(),
  type: z.string().optional(),
  description: z.string().optional(),
  quantity: z.number().optional(),
  unit_price: z.number().optional(),
  line_total: z.number().optional(),
  time_entry_id: z.string().nullable().optional(),
  expense_id: z.string().nullable().optional(),
  sort_order: z.number().optional(),
}).passthrough();
export type BackendInvoiceLineItem = z.infer<typeof BackendInvoiceLineItemSchema>;

export const BackendInvoiceSchema = z.object({
  id: z.string(),
  organization_id: z.string(),
  client_id: z.string(),
  matter_id: nullableString(),
  connected_account_id: z.string(),
  invoice_number: nullableString(),
  stripe_invoice_id: nullableString(),
  stripe_invoice_number: nullableString(),
  stripe_charge_id: nullableString(),
  stripe_transfer_id: nullableString(),
  stripe_payment_intent_id: nullableString(),
  stripe_hosted_invoice_url: nullableString(),
  invoice_type: nullableString(),
  status: nullableString(),
  subtotal: nullableNumber(),
  tax_amount: nullableNumber(),
  discount_amount: nullableNumber(),
  total: nullableNumber(),
  amount_paid: nullableNumber(),
  amount_due: nullableNumber(),
  fund_destination: nullableString(),
  payment_from_retainer: nullableBoolean(),
  issue_date: nullableDate(),
  due_date: nullableDate(),
  paid_at: nullableDate(),
  notes: nullableString(),
  memo: nullableString(),
  created_at: nullableDate(),
  updated_at: nullableDate(),
  line_items: z.array(BackendInvoiceLineItemSchema).nullable().optional(),
  lineItems: z.array(BackendInvoiceLineItemSchema).nullable().optional(),
  client: z.record(z.string(), z.unknown()).nullable().optional(),
  matter: z.record(z.string(), z.unknown()).nullable().optional(),
  connectedAccount: z.record(z.string(), z.unknown()).nullable().optional(),
}).passthrough();
export type BackendInvoice = z.infer<typeof BackendInvoiceSchema>;
