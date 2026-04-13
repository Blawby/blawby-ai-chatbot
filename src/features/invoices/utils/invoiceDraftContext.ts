import type { Invoice, InvoiceLineItem } from '@/features/matters/types/billing.types';
import type { MajorAmount } from '@/shared/utils/money';

const STORAGE_PREFIX = 'invoiceDraftContext:';

export type PendingInvoiceDraftContext = {
 matterId?: string | null;
 clientId?: string | null;
 lineItems?: InvoiceLineItem[];
 dueDate?: string;
 notes?: string;
 memo?: string;
 invoiceType?: Invoice['invoice_type'];
 invoiceContext?: 'default' | 'milestone' | 'retainer';
 milestoneToComplete?: {
  id: string;
  description: string;
  amount: MajorAmount;
  dueDate: string | null;
 } | null;
 returnPath?: string | null;
 returnLabel?: string | null;
};

const getStorageKey = (draftId: string) => `${STORAGE_PREFIX}${draftId}`;

export const createPendingInvoiceDraftContext = (context: PendingInvoiceDraftContext): string => {
 if (typeof window === 'undefined') {
  throw new Error('Invoice draft context requires a browser environment.');
 }

 const draftId = crypto.randomUUID();
 try {
  window.sessionStorage.setItem(getStorageKey(draftId), JSON.stringify(context));
 } catch (error) {
  throw new Error(
   error instanceof Error
    ? `Failed to persist invoice draft context: ${error.message}`
    : 'Failed to persist invoice draft context.'
  );
 }
 return draftId;
};

export const readPendingInvoiceDraftContext = (draftId: string): PendingInvoiceDraftContext | null => {
 if (typeof window === 'undefined') return null;
 const raw = window.sessionStorage.getItem(getStorageKey(draftId));
 if (!raw) return null;
 try {
  return JSON.parse(raw) as PendingInvoiceDraftContext;
 } catch {
  return null;
 }
};

export const clearPendingInvoiceDraftContext = (draftId: string) => {
 if (typeof window === 'undefined') return;
 window.sessionStorage.removeItem(getStorageKey(draftId));
};
