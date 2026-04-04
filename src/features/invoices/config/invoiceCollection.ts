import type {
  InvoiceFilterFieldKey,
  InvoiceFilterOperator,
  InvoiceFilterRule,
  InvoiceSummary,
} from '@/features/invoices/types';

export type InvoiceColumnKey =
  | 'total'
  | 'status'
  | 'invoiceNumber'
  | 'clientName'
  | 'clientEmail'
  | 'dueDate'
  | 'createdAt'
  | 'paidAt'
  | 'subtotal'
  | 'taxAmount'
  | 'discountAmount'
  | 'amountPaid'
  | 'amountDue'
  | 'issueDate'
  | 'invoiceType'
  | 'notes'
  | 'memo'
  | 'fundDestination'
  | 'updatedAt'
  | 'clientId'
  | 'matterId'
  | 'connectedAccountId'
  | 'matterTitle'
  | 'matterBillingType'
  | 'clientStatus'
  | 'stripeInvoiceNumber'
  | 'stripeInvoiceId'
  | 'stripeChargeId'
  | 'stripeTransferId'
  | 'stripePaymentIntentId'
  | 'stripeHostedInvoiceUrl'
  | 'connectedAccountEmail'
  | 'connectedAccountStripeAccountId';

export type InvoiceFilterFieldType = 'text' | 'date' | 'number' | 'enum';

export type InvoiceFilterGroupId =
  | 'core'
  | 'amount'
  | 'customerMatter'
  | 'metadata'
  | 'stripe';

export interface InvoiceColumnDefinition {
  key: InvoiceColumnKey;
  label: string;
}

export interface InvoiceFilterFieldDefinition {
  key: InvoiceFilterFieldKey;
  label: string;
  type: InvoiceFilterFieldType;
  group: InvoiceFilterGroupId;
}

export const DEFAULT_INVOICE_COLUMNS: InvoiceColumnKey[] = [
  'total',
  'status',
  'invoiceNumber',
  'clientName',
  'clientEmail',
  'dueDate',
  'createdAt',
];

export const CLIENT_SAFE_INVOICE_COLUMNS: InvoiceColumnDefinition[] = [
  { key: 'paidAt', label: 'Paid at' },
  { key: 'subtotal', label: 'Subtotal' },
  { key: 'taxAmount', label: 'Tax amount' },
  { key: 'discountAmount', label: 'Discount amount' },
  { key: 'amountPaid', label: 'Amount paid' },
  { key: 'amountDue', label: 'Amount due' },
  { key: 'issueDate', label: 'Issue date' },
  { key: 'invoiceType', label: 'Invoice type' },
  { key: 'notes', label: 'Notes' },
  { key: 'memo', label: 'Memo' },
  { key: 'fundDestination', label: 'Fund destination' },
  { key: 'updatedAt', label: 'Updated at' },
  { key: 'matterTitle', label: 'Matter title' },
  { key: 'matterBillingType', label: 'Billing type' },
  { key: 'clientStatus', label: 'Client status' },
  { key: 'stripeInvoiceNumber', label: 'Stripe invoice number' },
  { key: 'stripeHostedInvoiceUrl', label: 'Hosted invoice URL' },
];

export const PRACTICE_ONLY_INVOICE_COLUMNS: InvoiceColumnDefinition[] = [
  { key: 'clientId', label: 'Client ID' },
  { key: 'matterId', label: 'Matter ID' },
  { key: 'connectedAccountId', label: 'Connected account ID' },
  { key: 'stripeInvoiceId', label: 'Stripe invoice ID' },
  { key: 'stripeChargeId', label: 'Stripe charge ID' },
  { key: 'stripeTransferId', label: 'Stripe transfer ID' },
  { key: 'stripePaymentIntentId', label: 'Stripe payment intent ID' },
  { key: 'connectedAccountEmail', label: 'Connected account email' },
  { key: 'connectedAccountStripeAccountId', label: 'Stripe account ID' },
];

export const OPTIONAL_INVOICE_COLUMNS: InvoiceColumnDefinition[] = [
  ...CLIENT_SAFE_INVOICE_COLUMNS,
  ...PRACTICE_ONLY_INVOICE_COLUMNS,
];

export const INVOICE_FILTER_GROUP_LABELS: Record<InvoiceFilterGroupId, string> = {
  core: 'Core filters',
  amount: 'Amount filters',
  customerMatter: 'Customer and matter filters',
  metadata: 'Invoice metadata filters',
  stripe: 'Stripe reference filters',
};

export const CLIENT_SAFE_INVOICE_FILTER_FIELDS: InvoiceFilterFieldDefinition[] = [
  { key: 'status', label: 'Status', type: 'enum', group: 'core' },
  { key: 'createdAt', label: 'Created', type: 'date', group: 'core' },
  { key: 'dueDate', label: 'Due date', type: 'date', group: 'core' },
  { key: 'paidAt', label: 'Paid at', type: 'date', group: 'core' },
  { key: 'invoiceNumber', label: 'Invoice number', type: 'text', group: 'core' },

  { key: 'total', label: 'Total', type: 'number', group: 'amount' },
  { key: 'subtotal', label: 'Subtotal', type: 'number', group: 'amount' },
  { key: 'taxAmount', label: 'Tax amount', type: 'number', group: 'amount' },
  { key: 'discountAmount', label: 'Discount amount', type: 'number', group: 'amount' },
  { key: 'amountPaid', label: 'Amount paid', type: 'number', group: 'amount' },
  { key: 'amountDue', label: 'Amount due', type: 'number', group: 'amount' },
  { key: 'paymentFromRetainer', label: 'Payment from retainer', type: 'enum', group: 'amount' },

  { key: 'clientName', label: 'Customer name', type: 'text', group: 'customerMatter' },
  { key: 'clientEmail', label: 'Customer email', type: 'text', group: 'customerMatter' },
  { key: 'clientStatus', label: 'Client status', type: 'enum', group: 'customerMatter' },
  { key: 'matterTitle', label: 'Matter title', type: 'text', group: 'customerMatter' },
  { key: 'matterStatus', label: 'Matter status', type: 'enum', group: 'customerMatter' },
  { key: 'matterBillingType', label: 'Billing type', type: 'enum', group: 'customerMatter' },

  { key: 'invoiceType', label: 'Invoice type', type: 'enum', group: 'metadata' },
  { key: 'fundDestination', label: 'Fund destination', type: 'text', group: 'metadata' },
  { key: 'updatedAt', label: 'Updated at', type: 'date', group: 'metadata' },

  { key: 'stripeInvoiceNumber', label: 'Stripe invoice number', type: 'text', group: 'stripe' },
  { key: 'stripeHostedInvoiceUrl', label: 'Hosted invoice URL', type: 'text', group: 'stripe' },
];

export const PRACTICE_ONLY_INVOICE_FILTER_FIELDS: InvoiceFilterFieldDefinition[] = [
  { key: 'clientId', label: 'Client ID', type: 'text', group: 'customerMatter' },
  { key: 'matterId', label: 'Matter ID', type: 'text', group: 'customerMatter' },

  { key: 'stripeInvoiceId', label: 'Stripe invoice ID', type: 'text', group: 'stripe' },
  { key: 'stripeChargeId', label: 'Stripe charge ID', type: 'text', group: 'stripe' },
  { key: 'stripeTransferId', label: 'Stripe transfer ID', type: 'text', group: 'stripe' },
  { key: 'stripePaymentIntentId', label: 'Stripe payment intent ID', type: 'text', group: 'stripe' },
  { key: 'connectedAccountId', label: 'Connected account ID', type: 'text', group: 'stripe' },
  { key: 'connectedAccountEmail', label: 'Connected account email', type: 'text', group: 'stripe' },
  { key: 'connectedAccountStripeAccountId', label: 'Stripe account ID', type: 'text', group: 'stripe' },
];

export const INVOICE_FILTER_FIELDS: InvoiceFilterFieldDefinition[] = [
  ...CLIENT_SAFE_INVOICE_FILTER_FIELDS,
  ...PRACTICE_ONLY_INVOICE_FILTER_FIELDS,
];

export const getInvoiceFilterFieldDefinition = (key: InvoiceFilterFieldKey, audience: 'client' | 'practice' = 'practice') => {
  const fields = audience === 'client' ? CLIENT_SAFE_INVOICE_FILTER_FIELDS : INVOICE_FILTER_FIELDS;
  return fields.find((field) => field.key === key);
};

export const getInvoiceFilterOperators = (type: InvoiceFilterFieldType): InvoiceFilterOperator[] => {
  if (type === 'date') return ['is', 'before', 'after', 'between', 'isEmpty', 'isNotEmpty'];
  if (type === 'number') return ['equals', 'greaterThan', 'lessThan', 'between', 'isEmpty', 'isNotEmpty'];
  if (type === 'enum') return ['equals', 'isEmpty', 'isNotEmpty'];
  return ['contains', 'equals', 'startsWith', 'isEmpty', 'isNotEmpty'];
};

export const getInvoiceFieldValue = (invoice: InvoiceSummary, key: InvoiceFilterFieldKey) => {
  switch (key) {
    case 'status': return invoice.status;
    case 'createdAt': return invoice.createdAt;
    case 'dueDate': return invoice.dueDate;
    case 'paidAt': return invoice.paidAt;
    case 'invoiceNumber': return invoice.invoiceNumber;
    case 'total': return invoice.total;
    case 'subtotal': return invoice.subtotal;
    case 'taxAmount': return invoice.taxAmount;
    case 'discountAmount': return invoice.discountAmount;
    case 'amountPaid': return invoice.amountPaid;
    case 'amountDue': return invoice.amountDue;
    case 'paymentFromRetainer': return invoice.paymentFromRetainer;
    case 'clientName': return invoice.clientName;
    case 'clientEmail': return invoice.clientEmail;
    case 'clientId': return invoice.clientId;
    case 'clientStatus': return invoice.clientStatus;
    case 'matterId': return invoice.matterId;
    case 'matterTitle': return invoice.matterTitle;
    case 'matterStatus': return invoice.matterStatus;
    case 'matterBillingType': return invoice.matterBillingType;
    case 'invoiceType': return invoice.invoiceType;
    case 'fundDestination': return invoice.fundDestination;
    case 'updatedAt': return invoice.updatedAt;
    case 'stripeInvoiceId': return invoice.stripeInvoiceId;
    case 'stripeInvoiceNumber': return invoice.stripeInvoiceNumber;
    case 'stripeChargeId': return invoice.stripeChargeId;
    case 'stripeTransferId': return invoice.stripeTransferId;
    case 'stripePaymentIntentId': return invoice.stripePaymentIntentId;
    case 'stripeHostedInvoiceUrl': return invoice.stripeHostedInvoiceUrl;
    case 'connectedAccountId': return invoice.connectedAccountId;
    case 'connectedAccountEmail': return invoice.connectedAccountEmail;
    case 'connectedAccountStripeAccountId': return invoice.connectedAccountStripeAccountId;
    default: return undefined;
  }
};

const isEmptyValue = (value: unknown) => {
  if (value == null) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  return false;
};

const normalizeDateValue = (value: unknown) => {
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  // If it's already YYYY-MM-DD format, return as is
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatLocalYMD = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const applyInvoiceFilterRule = (invoice: InvoiceSummary, rule: InvoiceFilterRule, audience: 'client' | 'practice' = 'practice'): boolean => {
  const field = getInvoiceFilterFieldDefinition(rule.field, audience);
  if (!field) return false;

  const rawValue = getInvoiceFieldValue(invoice, rule.field);

  if (rule.operator === 'isEmpty') return isEmptyValue(rawValue);
  if (rule.operator === 'isNotEmpty') return !isEmptyValue(rawValue);

  if (field.type === 'number') {
    const value = typeof rawValue === 'number' ? rawValue : null;
    const target = rule.value != null && rule.value !== '' ? Number(rule.value) : null;
    const upper = rule.valueTo != null && rule.valueTo !== '' ? Number(rule.valueTo) : null;
    if (value == null) return false;
    if (rule.operator === 'equals') return target != null && value === target;
    if (rule.operator === 'greaterThan') return target != null && value > target;
    if (rule.operator === 'lessThan') return target != null && value < target;
    if (rule.operator === 'between') return target != null && upper != null && value >= target && value <= upper;
    return false;
  }

  if (field.type === 'date') {
    const value = normalizeDateValue(rawValue);
    const target = normalizeDateValue(rule.value);
    const upper = normalizeDateValue(rule.valueTo);
    if (!value) return false;
    const dayValue = typeof value === 'string' ? value : formatLocalYMD(value);
    const dayTarget = target ? (typeof target === 'string' ? target : formatLocalYMD(target)) : null;
    const dayUpper = upper ? (typeof upper === 'string' ? upper : formatLocalYMD(upper)) : null;
    if (rule.operator === 'is') return dayTarget != null && dayValue === dayTarget;
    if (rule.operator === 'before') return dayTarget != null && dayValue < dayTarget;
    if (rule.operator === 'after') return dayTarget != null && dayValue > dayTarget;
    if (rule.operator === 'between') return dayTarget != null && dayUpper != null && dayValue >= dayTarget && dayValue <= dayUpper;
    return false;
  }

  const textValue = String(rawValue ?? '').toLowerCase();
  const textTarget = String(rule.value ?? '').toLowerCase();

  if (field.type === 'enum') {
    if (rule.operator !== 'equals') return false;
    return textTarget.length > 0 && textValue === textTarget;
  }

  if ((rule.operator === 'startsWith' || rule.operator === 'contains') && textTarget.length === 0) {
    return false;
  }

  if (rule.operator === 'equals') return textValue === textTarget;
  if (rule.operator === 'startsWith') return textValue.startsWith(textTarget);
  if (rule.operator === 'contains') return textValue.includes(textTarget);
  return false;
};
