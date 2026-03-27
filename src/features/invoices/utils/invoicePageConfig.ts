export type InvoicePageMode = 'create' | 'edit' | 'readOnly';

export const INVOICE_CREATE_SEND_EVENT = 'blawby:invoice-create-send';

export const resolveInvoicePageMode = (status?: string | null): InvoicePageMode => {
  const normalized = typeof status === 'string' ? status.trim().toLowerCase() : '';
  if (normalized === 'draft') {
    return 'edit';
  }
  return 'readOnly';
};
