import type { MajorAmount } from '@/shared/utils/money';

export type InvoiceStatus = 'draft' | 'pending' | 'sent' | 'paid' | 'overdue' | 'cancelled';
export type InvoiceType = 'flat_fee' | 'retainer_deposit' | 'phase_fee' | 'hourly' | 'contingency';
export type LineItemType = 'service' | 'time_entry' | 'expense' | 'flat_fee' | 'retainer' | 'other';

export type InvoiceLineItem = {
 id: string;
 type: LineItemType;
 description: string;
 quantity: number;
 unit_price: MajorAmount;
 line_total: MajorAmount;
 time_entry_id?: string | null;
 expense_id?: string | null;
 sort_order?: number;
};

export type Invoice = {
 id: string;
 organization_id: string;
 client_id: string;
 matter_id: string | null;
 connected_account_id: string;
 invoice_number: string | null;
 stripe_invoice_id: string | null;
 stripe_invoice_number?: string | null;
 stripe_charge_id?: string | null;
 stripe_transfer_id?: string | null;
 stripe_payment_intent_id?: string | null;
 stripe_hosted_invoice_url: string | null;
 invoice_type: InvoiceType;
 status: InvoiceStatus;
 subtotal: MajorAmount;
 tax_amount: MajorAmount;
 discount_amount: MajorAmount;
 total: MajorAmount;
 amount_paid: MajorAmount;
 amount_due: MajorAmount;
 fund_destination?: string | null;
 payment_from_retainer?: boolean | null;
 issue_date: string | null;
 due_date: string | null;
 paid_at: string | null;
 notes: string | null;
 memo: string | null;
 created_at: string;
 updated_at: string;
 line_items?: InvoiceLineItem[];
 client?: {
  id?: string;
  name?: string | null;
  email?: string | null;
  status?: string | null;
 } | null;
 matter?: {
  id: string;
  title: string;
  status?: string;
  billing_type?: string | null;
  retainer_balance?: MajorAmount | null;
 } | null;
 connectedAccount?: {
  email?: string | null;
  stripe_account_id?: string | null;
 } | null;
};

export type UnbilledTimeEntry = {
 id: string;
 description: string;
 duration_seconds: number;
 duration_hours: number;
 amount: MajorAmount;
 start_time?: string | null;
 end_time?: string | null;
};

export type UnbilledExpense = {
 id: string;
 description: string;
 amount: MajorAmount;
 date?: string | null;
};

export type UnbilledSummary = {
 unbilledTime: {
  hours: number;
  amount: MajorAmount;
  entries: number;
 };
 unbilledExpenses: {
  count: number;
  amount: MajorAmount;
 };
 totalUnbilled: MajorAmount;
 matterBillingType: 'hourly' | 'fixed' | 'contingency' | 'pro_bono';
 rates: {
  attorney: MajorAmount | null;
  admin: MajorAmount | null;
 };
};

export type CreateInvoicePayload = {
 client_id: string;
 matter_id?: string;
 connected_account_id: string;
 invoice_number?: string;
 invoice_type: InvoiceType;
 due_date?: string;
 notes?: string;
 memo?: string;
 line_items: InvoiceLineItem[];
};
