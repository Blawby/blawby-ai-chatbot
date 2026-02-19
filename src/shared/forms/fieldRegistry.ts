import { Input } from '@/shared/ui/input/Input';
import { EmailInput } from '@/shared/ui/input/EmailInput';
import { PhoneInput } from '@/shared/ui/input/PhoneInput';
import { Combobox, type ComboboxOption } from '@/shared/ui/input/Combobox';
import { AddressInput } from '@/shared/ui/address/AddressInput';
import { Textarea } from '@/shared/ui/input/Textarea';
import type { Address } from '@/shared/types/ui';
import type { FunctionalComponent } from 'preact';

// Status options for client forms
const STATUS_OPTIONS: ComboboxOption[] = [
  { value: 'lead', label: 'Lead' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'archived', label: 'Archived' },
];

// Currency options for client forms
const CURRENCY_OPTIONS: ComboboxOption[] = [
  { value: 'usd', label: 'USD' },
  { value: 'cad', label: 'CAD' },
  { value: 'eur', label: 'EUR' },
  { value: 'gbp', label: 'GBP' },
];

// Component factory types
export type ComponentFactory = FunctionalComponent<Record<string, unknown>>;
export type FieldAdapter = {
  toFormValue?: (value: unknown) => unknown;
  fromFormValue?: (value: unknown) => unknown;
};

// Field registry entry
export interface FieldRegistryEntry {
  component: ComponentFactory;
  label: string;
  placeholder?: string;
  defaultValue?: unknown;
  adapter?: FieldAdapter;
  ui?: {
    gridSpan?: number;
    section?: string;
  };
  options?: ComboboxOption[];
}

const asComponentFactory = <P,>(component: FunctionalComponent<P>): ComponentFactory =>
  component as unknown as ComponentFactory;

// Field registry - single source of truth for all form fields
export const FIELD_REGISTRY: Record<string, FieldRegistryEntry> = {
  // Basic text fields
  name: {
    component: asComponentFactory(Input),
    label: 'Name',
    placeholder: 'Enter name',
    defaultValue: '',
    ui: { gridSpan: 1, section: 'basic' },
  },
  
  opposingParty: {
    component: asComponentFactory(Input),
    label: 'Opposing Party',
    placeholder: 'Enter opposing party name',
    defaultValue: '',
    ui: { gridSpan: 2, section: 'case' },
  },
  
  description: {
    component: asComponentFactory(Textarea),
    label: 'Description',
    placeholder: 'Describe your case',
    defaultValue: '',
    ui: { gridSpan: 2, section: 'case' },
  },
  
  // Contact fields
  email: {
    component: asComponentFactory(EmailInput),
    label: 'Email',
    placeholder: 'your.email@example.com',
    defaultValue: '',
    ui: { gridSpan: 1, section: 'contact' },
  },
  
  businessEmail: {
    component: asComponentFactory(EmailInput),
    label: 'Business Email',
    placeholder: 'business@example.com',
    defaultValue: '',
    ui: { gridSpan: 1, section: 'contact' },
  },
  
  phone: {
    component: asComponentFactory(PhoneInput),
    label: 'Phone',
    placeholder: '+1 (555) 123-4567',
    defaultValue: '',
    ui: { gridSpan: 1, section: 'contact' },
  },
  
  contactPhone: {
    component: asComponentFactory(PhoneInput),
    label: 'Contact Phone',
    placeholder: '+1 (555) 123-4567',
    defaultValue: '',
    ui: { gridSpan: 1, section: 'contact' },
  },
  
  // Client-specific fields
  status: {
    component: asComponentFactory(Combobox),
    label: 'Status',
    placeholder: 'Select status',
    defaultValue: 'lead',
    options: STATUS_OPTIONS,
    ui: { gridSpan: 1, section: 'client' },
  },
  
  currency: {
    component: asComponentFactory(Combobox),
    label: 'Currency',
    placeholder: 'Select currency',
    defaultValue: 'usd',
    options: CURRENCY_OPTIONS,
    ui: { gridSpan: 1, section: 'client' },
  },
  
  // Address field (special case)
  address: {
    component: asComponentFactory(AddressInput),
    label: 'Address',
    placeholder: 'Enter address',
    defaultValue: undefined,
    ui: { gridSpan: 2, section: 'address' },
    adapter: {
      toFormValue: (value: Address | undefined) => value || null,
      fromFormValue: (value: Address | null) => value || undefined,
    },
  },
};

// Helper to get field registry entry
export function getFieldEntry(fieldId: string): FieldRegistryEntry {
  const entry = FIELD_REGISTRY[fieldId];
  if (!entry) {
    throw new Error(`Field "${fieldId}" not found in field registry`);
  }
  return entry;
}

// Helper to get default values for a set of fields
export function getDefaultValues(fieldIds: string[]): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  
  for (const fieldId of fieldIds) {
    const entry = getFieldEntry(fieldId);
    defaults[fieldId] = entry.defaultValue;
  }
  
  return defaults;
}

// Helper to apply field adapters
export function applyFieldAdapter(fieldId: string, value: unknown): unknown {
  const entry = getFieldEntry(fieldId);
  
  if (entry.adapter?.toFormValue) {
    return entry.adapter.toFormValue(value);
  }
  
  return value;
}

// Helper to reverse field adapters (for form submission)
export function reverseFieldAdapter(fieldId: string, value: unknown): unknown {
  const entry = getFieldEntry(fieldId);
  
  if (entry.adapter?.fromFormValue) {
    return entry.adapter.fromFormValue(value);
  }
  
  return value;
}
