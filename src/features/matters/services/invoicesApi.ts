import axios from 'axios';
import { apiClient } from '@/shared/lib/apiClient';
import { urls } from '@/config/urls';
import {
  assertMajorUnits,
  asMajor,
  toMajorUnits,
  toMinorUnitsValue,
  type MajorAmount
} from '@/shared/utils/money';
import type {
  CreateInvoicePayload,
  Invoice,
  InvoiceLineItem,
  UnbilledExpense,
  UnbilledSummary,
  UnbilledTimeEntry
} from '@/features/matters/types/billing.types';

type FetchOptions = {
  signal?: AbortSignal;
};

type BackendInvoiceLineItem = {
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

const getErrorMessage = (error: unknown, fallback: string) => {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data;
    if (typeof data === 'string' && data.trim().length > 0) return data;
    if (data && typeof data === 'object') {
      const record = data as Record<string, unknown>;
      const message = typeof record.message === 'string' ? record.message : null;
      const err = typeof record.error === 'string' ? record.error : null;
      return message ?? err ?? error.message ?? fallback;
    }
    return error.message ?? fallback;
  }
  if (error instanceof Error) return error.message || fallback;
  return fallback;
};

const requestData = async <T>(promise: Promise<{ data: T }>, fallbackMessage: string): Promise<T> => {
  try {
    const response = await promise;
    return response.data;
  } catch (error) {
    if (axios.isCancel(error) || (error instanceof Error && error.name === 'AbortError')) {
      throw error;
    }
    const normalized = new Error(getErrorMessage(error, fallbackMessage)) as Error & { status?: number };
    if (axios.isAxiosError(error)) {
      normalized.status = error.response?.status;
    }
    throw normalized;
  }
};

const isBackendInvoice = (val: unknown): val is BackendInvoice => {
  if (!val || typeof val !== 'object') return false;
  const record = val as Record<string, unknown>;
  return (
    typeof record.id === 'string' &&
    typeof record.organization_id === 'string' &&
    typeof record.client_id === 'string' &&
    typeof record.connected_account_id === 'string'
  );
};

export const extractInvoicesArray = (payload: unknown): BackendInvoice[] => {
  if (Array.isArray(payload)) {
    return payload.filter(isBackendInvoice);
  }
  if (!payload || typeof payload !== 'object') return [];
  const record = payload as Record<string, unknown>;
  if (Array.isArray(record.invoices)) {
    return record.invoices.filter(isBackendInvoice);
  }
  if (record.invoice && isBackendInvoice(record.invoice)) {
    return [record.invoice as BackendInvoice];
  }
  if (isBackendInvoice(record)) {
    return [record as BackendInvoice];
  }
  if (record.data) return extractInvoicesArray(record.data);
  return [];
};

const formatDate = (value: string | Date | null | undefined): string | null => {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return typeof value === 'string' ? value : null;
};

const normalizeLineItem = (item: BackendInvoiceLineItem): InvoiceLineItem => ({
  id: item.id || crypto.randomUUID(),
  type: (item.type ?? 'other') as InvoiceLineItem['type'],
  description: item.description ?? '',
  quantity: typeof item.quantity === 'number' && Number.isFinite(item.quantity) ? item.quantity : 1,
  unit_price: asMajor(toMajorUnits(item.unit_price ?? 0) ?? 0),
  line_total: asMajor(toMajorUnits(item.line_total ?? 0) ?? 0),
  time_entry_id: item.time_entry_id ?? null,
  expense_id: item.expense_id ?? null,
  sort_order: item.sort_order
});

export const normalizeInvoice = (invoice: BackendInvoice): Invoice => {
  const lineItems = Array.isArray(invoice.line_items)
    ? invoice.line_items
    : Array.isArray(invoice.lineItems)
      ? invoice.lineItems
      : [];

  return {
    id: invoice.id,
    organization_id: invoice.organization_id,
    client_id: invoice.client_id,
    matter_id: invoice.matter_id ?? null,
    connected_account_id: invoice.connected_account_id,
    invoice_number: invoice.invoice_number ?? null,
    stripe_invoice_id: invoice.stripe_invoice_id ?? null,
    stripe_invoice_number: invoice.stripe_invoice_number ?? null,
    stripe_charge_id: invoice.stripe_charge_id ?? null,
    stripe_transfer_id: invoice.stripe_transfer_id ?? null,
    stripe_payment_intent_id: invoice.stripe_payment_intent_id ?? null,
    stripe_hosted_invoice_url: invoice.stripe_hosted_invoice_url ?? null,
    invoice_type: (invoice.invoice_type ?? 'flat_fee') as Invoice['invoice_type'],
    status: (invoice.status ?? 'draft') as Invoice['status'],
    subtotal: asMajor(toMajorUnits(invoice.subtotal ?? 0) ?? 0),
    tax_amount: asMajor(toMajorUnits(invoice.tax_amount ?? 0) ?? 0),
    discount_amount: asMajor(toMajorUnits(invoice.discount_amount ?? 0) ?? 0),
    total: asMajor(toMajorUnits(invoice.total ?? 0) ?? 0),
    amount_paid: asMajor(toMajorUnits(invoice.amount_paid ?? 0) ?? 0),
    amount_due: asMajor(toMajorUnits(invoice.amount_due ?? 0) ?? 0),
    fund_destination: invoice.fund_destination ?? null,
    payment_from_retainer: invoice.payment_from_retainer ?? null,
    issue_date: formatDate(invoice.issue_date),
    due_date: formatDate(invoice.due_date),
    paid_at: formatDate(invoice.paid_at),
    notes: invoice.notes ?? null,
    memo: invoice.memo ?? null,
    created_at: formatDate(invoice.created_at) ?? new Date(0).toISOString(),
    updated_at: formatDate(invoice.updated_at) ?? new Date(0).toISOString(),
    line_items: lineItems.map(normalizeLineItem),
    client: invoice.client ?? null,
    matter: invoice.matter
      ? {
          id: typeof invoice.matter.id === 'string' ? invoice.matter.id : '',
          title: typeof invoice.matter.title === 'string' ? invoice.matter.title : '',
          status: typeof invoice.matter.status === 'string' ? invoice.matter.status : undefined,
          billing_type: typeof invoice.matter.billing_type === 'string' ? invoice.matter.billing_type : null,
          retainer_balance: typeof invoice.matter.retainer_balance === 'number'
            ? asMajor(toMajorUnits(invoice.matter.retainer_balance) ?? 0)
            : null,
        }
      : null,
    connectedAccount: invoice.connectedAccount
      ? {
          email: typeof invoice.connectedAccount.email === 'string' ? invoice.connectedAccount.email : null,
          stripe_account_id: typeof invoice.connectedAccount.stripe_account_id === 'string'
            ? invoice.connectedAccount.stripe_account_id
            : null,
        }
      : null,
  };
};

const toUnbilledTimeEntry = (value: unknown): UnbilledTimeEntry | null => {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const id = typeof record.id === 'string' ? record.id : '';
  if (!id) return null;
  const minutes = typeof record.duration_minutes === 'number'
    ? record.duration_minutes
    : null;
  const seconds = typeof record.duration_seconds === 'number'
    ? record.duration_seconds
    : typeof record.duration === 'number'
      ? record.duration
      : typeof minutes === 'number'
        ? minutes * 60
      : 0;
  const hours = typeof record.duration_hours === 'number'
    ? record.duration_hours
    : seconds / 3600;
  return {
    id,
    description: typeof record.description === 'string' ? record.description : '',
    duration_seconds: seconds,
    duration_hours: hours,
    amount: asMajor(
      toMajorUnits(
        typeof record.total === 'number'
          ? record.total
          : typeof record.amount === 'number'
            ? record.amount
            : 0
      ) ?? 0
    ),
    start_time: typeof record.start_time === 'string' ? record.start_time : null,
    end_time: typeof record.end_time === 'string' ? record.end_time : null
  };
};

const toUnbilledExpense = (value: unknown): UnbilledExpense | null => {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const id = typeof record.id === 'string' ? record.id : '';
  if (!id) return null;
  return {
    id,
    description: typeof record.description === 'string' ? record.description : 'Expense',
    amount: asMajor(toMajorUnits(typeof record.amount === 'number' ? record.amount : 0) ?? 0),
    date: typeof record.date === 'string'
      ? record.date
      : typeof record.created_at === 'string'
        ? record.created_at
        : null
  };
};

const unwrapPayloadRecord = (payload: unknown): Record<string, unknown> => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {};
  }
  const record = payload as Record<string, unknown>;
  if (record.data && typeof record.data === 'object' && !Array.isArray(record.data)) {
    return unwrapPayloadRecord(record.data);
  }
  return record;
};

const toUnbilledSummary = (
  timeEntries: UnbilledTimeEntry[],
  expenses: UnbilledExpense[],
  record: Record<string, unknown>,
  defaults?: Partial<Pick<UnbilledSummary, 'matterBillingType' | 'rates'>>
): UnbilledSummary => {
  const rates = (record.rates && typeof record.rates === 'object' ? record.rates : {}) as Record<string, unknown>;
  const explicitTime = (record.unbilledTime && typeof record.unbilledTime === 'object' ? record.unbilledTime : {}) as Record<string, unknown>;
  const explicitExpenses = (record.unbilledExpenses && typeof record.unbilledExpenses === 'object' ? record.unbilledExpenses : {}) as Record<string, unknown>;
  const timeHours = timeEntries.reduce((sum, entry) => sum + (entry.duration_hours ?? 0), 0);
  const timeAmount = timeEntries.reduce((sum, entry) => sum + Number(entry.amount ?? 0), 0);
  const expenseAmount = expenses.reduce((sum, entry) => sum + Number(entry.amount ?? 0), 0);
  const resolvedTimeAmount = typeof explicitTime.amount === 'number'
    ? toMajorUnits(explicitTime.amount) ?? 0
    : timeAmount;
  const resolvedExpenseAmount = typeof explicitExpenses.amount === 'number'
    ? toMajorUnits(explicitExpenses.amount) ?? 0
    : expenseAmount;
  const totalUnbilled = resolvedTimeAmount + resolvedExpenseAmount;

  return {
    unbilledTime: {
      hours: typeof explicitTime.hours === 'number' ? explicitTime.hours : timeHours,
      amount: typeof explicitTime.amount === 'number'
        ? asMajor(toMajorUnits(explicitTime.amount) ?? 0)
        : asMajor(timeAmount),
      entries: typeof explicitTime.entries === 'number' ? explicitTime.entries : timeEntries.length
    },
    unbilledExpenses: {
      count: typeof explicitExpenses.count === 'number' ? explicitExpenses.count : expenses.length,
      amount: typeof explicitExpenses.amount === 'number'
        ? asMajor(toMajorUnits(explicitExpenses.amount) ?? 0)
        : asMajor(expenseAmount)
    },
    totalUnbilled: asMajor(totalUnbilled),
    matterBillingType: (
      typeof record.matterBillingType === 'string'
        ? record.matterBillingType
        : defaults?.matterBillingType ?? 'hourly'
    ) as UnbilledSummary['matterBillingType'],
    rates: {
      attorney: typeof rates.attorney === 'number'
        ? asMajor(toMajorUnits(rates.attorney) ?? 0)
        : defaults?.rates?.attorney ?? null,
      admin: typeof rates.admin === 'number'
        ? asMajor(toMajorUnits(rates.admin) ?? 0)
        : defaults?.rates?.admin ?? null
    }
  };
};

export type MatterUnbilledData = {
  timeEntries: UnbilledTimeEntry[];
  expenses: UnbilledExpense[];
  summary: UnbilledSummary;
};

export const getMatterUnbilledData = async (
  practiceId: string,
  matterId: string,
  options: FetchOptions & {
    summaryDefaults?: Partial<Pick<UnbilledSummary, 'matterBillingType' | 'rates'>>;
  } = {}
): Promise<MatterUnbilledData> => {
  if (!practiceId || !matterId) {
    throw new Error('Practice ID and Matter ID are required');
  }

  const payload = await requestData(
    apiClient.get(
      urls.matterUnbilled(practiceId, matterId),
      { signal: options.signal }
    ),
    'Failed to load unbilled matter data'
  );

  const record = unwrapPayloadRecord(payload);
  const timeEntriesRaw = Array.isArray(record.time_entries)
    ? record.time_entries
    : Array.isArray(record.timeEntries)
      ? record.timeEntries
      : [];
  const parsedTimeEntries = timeEntriesRaw
    .map(toUnbilledTimeEntry)
    .filter((item): item is UnbilledTimeEntry => item !== null);
  const expenses = Array.isArray(record.expenses)
    ? record.expenses.map(toUnbilledExpense).filter((item): item is UnbilledExpense => item !== null)
    : [];

  return {
    timeEntries: parsedTimeEntries,
    expenses,
    summary: toUnbilledSummary(parsedTimeEntries, expenses, record, options.summaryDefaults)
  };
};

const toMinorAmount = (value: MajorAmount): number => {
  assertMajorUnits(value, 'invoice.line_item.amount');
  return Number(toMinorUnitsValue(value));
};

const buildInvoiceNumber = () => {
  const date = new Date();
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let rand = '';
  for (let i = 0; i < 4; i++) {
    rand += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `INV-${y}${m}${d}-${rand}`;
};

const normalizeCreatePayload = (payload: CreateInvoicePayload) => ({
  ...payload,
  invoice_number: payload.invoice_number || buildInvoiceNumber(),
  line_items: payload.line_items.map(({ id: _id, line_total: _total, ...item }, index) => {
    const unitMinor = toMinorAmount(item.unit_price);
    return {
      ...item,
      sort_order: item.sort_order ?? index,
      unit_price: unitMinor
    };
  })
});

export const listInvoices = async (
  practiceId: string,
  matterId?: string,
  options: FetchOptions = {}
): Promise<Invoice[]> => {
  if (!practiceId) return [];
  const params = matterId ? { matter_id: matterId } : undefined;
  const payload = await requestData(
    apiClient.get(urls.invoices(practiceId), { params, signal: options.signal }),
    'Failed to load invoices'
  );
  return extractInvoicesArray(payload).map(normalizeInvoice);
};

export const getInvoice = async (
  practiceId: string,
  invoiceId: string,
  options: FetchOptions = {}
): Promise<Invoice | null> => {
  if (!practiceId || !invoiceId) return null;
  const payload = await requestData(
    apiClient.get(urls.invoices(practiceId), {
      params: { invoice_id: invoiceId },
      signal: options.signal
    }),
    'Failed to load invoice'
  );
  const invoice = extractInvoicesArray(payload)[0];
  return invoice ? normalizeInvoice(invoice) : null;
};

export const createInvoice = async (
  practiceId: string,
  payload: CreateInvoicePayload,
  options: FetchOptions = {}
): Promise<Invoice | null> => {
  if (!practiceId) return null;
  const data = await requestData(
    apiClient.post(
      urls.createInvoice(practiceId),
      normalizeCreatePayload(payload),
      { signal: options.signal }
    ),
    'Failed to create invoice'
  );
  const invoice = extractInvoicesArray(data)[0];
  return invoice ? normalizeInvoice(invoice) : null;
};

export const sendInvoice = async (
  practiceId: string,
  invoiceId: string,
  options: FetchOptions = {}
): Promise<Invoice | null> => {
  if (!practiceId || !invoiceId) return null;
  const payload = await requestData(
    apiClient.post(
      urls.sendInvoice(practiceId, invoiceId),
      {},
      { signal: options.signal }
    ),
    'Failed to send invoice'
  );
  const invoice = extractInvoicesArray(payload)[0];
  return invoice ? normalizeInvoice(invoice) : null;
};

export const updateInvoice = async (
  practiceId: string,
  invoiceId: string,
  payload: Partial<CreateInvoicePayload>,
  options: FetchOptions = {}
): Promise<Invoice | null> => {
  if (!practiceId || !invoiceId) return null;
  const body: Record<string, unknown> = { ...payload };
  if (Array.isArray(payload.line_items)) {
    body.line_items = payload.line_items.map(({ id: _id, line_total: _total, ...item }, index) => {
      const unitMinor = toMinorAmount(item.unit_price);
      return {
        ...item,
        sort_order: item.sort_order ?? index,
        unit_price: unitMinor
      };
    });
  }
  const data = await requestData(
    apiClient.patch(
      urls.updateInvoice(practiceId, invoiceId),
      body,
      { signal: options.signal }
    ),
    'Failed to update invoice'
  );
  const invoice = extractInvoicesArray(data)[0];
  return invoice ? normalizeInvoice(invoice) : null;
};

export const voidInvoice = async (
  practiceId: string,
  invoiceId: string,
  options: FetchOptions = {}
): Promise<Invoice | null> => {
  if (!practiceId || !invoiceId) return null;
  const payload = await requestData(
    apiClient.post(
      urls.voidInvoice(practiceId, invoiceId),
      {},
      { signal: options.signal }
    ),
    'Failed to void invoice'
  );
  const invoice = extractInvoicesArray(payload)[0];
  return invoice ? normalizeInvoice(invoice) : null;
};

export const syncInvoice = async (
  practiceId: string,
  invoiceId: string,
  options: FetchOptions = {}
): Promise<Invoice | null> => {
  if (!practiceId || !invoiceId) return null;
  const payload = await requestData(
    apiClient.post(
      urls.syncInvoice(practiceId, invoiceId),
      {},
      { signal: options.signal }
    ),
    'Failed to sync invoice'
  );
  const invoice = extractInvoicesArray(payload)[0];
  return invoice ? normalizeInvoice(invoice) : null;
};

export const deleteInvoice = async (
  practiceId: string,
  invoiceId: string,
  options: FetchOptions = {}
): Promise<void> => {
  if (!practiceId || !invoiceId) return;
  await requestData(
    apiClient.delete(
      urls.deleteInvoice(practiceId, invoiceId),
      { signal: options.signal }
    ),
    'Failed to delete invoice'
  );
};

export const getUnbilledTimeEntries = async (
  practiceId: string,
  matterId: string,
  options: FetchOptions = {}
): Promise<UnbilledTimeEntry[]> => {
  if (!practiceId || !matterId) return [];
  const result = await getMatterUnbilledData(practiceId, matterId, { signal: options.signal });
  return result.timeEntries;
};

export const getUnbilledExpenses = async (
  practiceId: string,
  matterId: string,
  options: FetchOptions = {}
): Promise<UnbilledExpense[]> => {
  if (!practiceId || !matterId) return [];
  const result = await getMatterUnbilledData(practiceId, matterId, { signal: options.signal });
  return result.expenses;
};

export const getUnbilledSummary = async (
  practiceId: string,
  matterId: string,
  options: FetchOptions = {}
): Promise<UnbilledSummary> => {
  const result = await getMatterUnbilledData(practiceId, matterId, { signal: options.signal });
  return result.summary;
};

export type BillingSummaryResult = { matterId: string; totalUnbilled: MajorAmount | null }[];

export const getPracticeBillingSummary = async (
  practiceId: string,
  matterIds: string[],
  options: FetchOptions = {}
): Promise<BillingSummaryResult> => {
  if (!practiceId || matterIds.length === 0) return [];
  const params = new URLSearchParams({ matterIds: matterIds.join(',') });
  const payload = await requestData(
    apiClient.get(`/api/practice/${encodeURIComponent(practiceId)}/billing/summary?${params}`, { signal: options.signal }),
    'Failed to load billing summary'
  );
  const record = unwrapPayloadRecord(payload);
  const summaries = Array.isArray(record.summaries) ? record.summaries : [];
  return (summaries as Record<string, unknown>[])
    .filter((item) => typeof item.matterId === 'string')
    .map((item) => ({
      matterId: item.matterId as string,
      totalUnbilled: typeof item.totalUnbilled === 'number' ? asMajor(item.totalUnbilled) : null,
    }));
};
