export type InvoicePageMode = 'create' | 'edit' | 'readOnly';

export const INVOICE_CREATE_SEND_EVENT = 'blawby:invoice-create-send';

export const resolveInvoicePageMode = (status?: string | null): InvoicePageMode => {
  if (!status || status.trim() === '') {
    return 'create';
  }
  const normalized = status.trim().toLowerCase();
  if (normalized === 'draft') {
    return 'edit';
  }
  return 'readOnly';
};
