export type InvoicePageMode = 'create' | 'edit' | 'readOnly';

export const INVOICE_CREATE_SEND_EVENT = 'blawby:invoice-create-send';

const VOIDABLE_STATUSES = new Set(['draft', 'sent', 'pending', 'open', 'overdue']);
const NON_REFUNDABLE_STATUSES = new Set(['draft', 'void', 'cancelled']);

const normalize = (status?: string | null): string =>
  typeof status === 'string' ? status.trim().toLowerCase() : '';

export const resolveInvoicePageMode = (status?: string | null): InvoicePageMode => {
  const normalized = normalize(status);
  if (!normalized) return 'create';
  if (normalized === 'draft') return 'edit';
  return 'readOnly';
};

export const isVoidableStatus = (status?: string | null): boolean =>
  VOIDABLE_STATUSES.has(normalize(status));

export const isRefundableStatus = (status?: string | null, amountPaid = 0): boolean => {
  const normalized = normalize(status);
  if (!normalized) return false;
  if (NON_REFUNDABLE_STATUSES.has(normalized)) return false;
  return amountPaid > 0;
};

export const isActionableOpenStatus = (status?: string | null): boolean => {
  const normalized = normalize(status);
  return normalized === 'sent' || normalized === 'pending' || normalized === 'open' || normalized === 'overdue';
};
