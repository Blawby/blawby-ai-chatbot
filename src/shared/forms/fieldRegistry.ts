import { Input } from '@/shared/ui/input/Input';
import { EmailInput } from '@/shared/ui/input/EmailInput';
import { PhoneInput } from '@/shared/ui/input/PhoneInput';
import { Select, type SelectOption } from '@/shared/ui/input/Select';
import { AddressInput } from '@/shared/ui/address/AddressInput';
import { Textarea } from '@/shared/ui/input/Textarea';
import type { Address } from '@/shared/types/ui';
import type { JSX, FunctionalComponent } from 'preact';

// Status options for client forms
const STATUS_OPTIONS: SelectOption[] = [
  { value: 'lead', label: 'Lead' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'archived', label: 'Archived' },
];

// Currency options for client forms
const CURRENCY_OPTIONS: SelectOption[] = [
  { value: 'usd', label: 'USD' },
  { value: 'cad', label: 'CAD' },
  { value: 'eur', label: 'EUR' },
  { value: 'gbp', label: 'GBP' },
];

// Component factory types
export type ComponentFactory = FunctionalComponent<any>;
export type FieldAdapter = {
  toFormValue?: (value: any) => any;
  fromFormValue?: (value: any) => any;
};

// Field registry entry
export interface FieldRegistryEntry {
  component: ComponentFactory;
  label: string;
  placeholder?: string;
  defaultValue?: any;
  adapter?: FieldAdapter;
  ui?: {
    gridSpan?: number;
    section?: string;
  };
  options?: SelectOption[];
}

// Field registry - single source of truth for all form fields
export const FIELD_REGISTRY: Record<string, FieldRegistryEntry> = {
  // Basic text fields
  name: {
    component: Input,
    label: 'Name',
    placeholder: 'Enter name',
    defaultValue: '',
    ui: { gridSpan: 1, section: 'basic' },
  },
  
  opposingParty: {
    component: Input,
    label: 'Opposing Party',
    placeholder: 'Enter opposing party name',
    defaultValue: '',
    ui: { gridSpan: 2, section: 'case' },
  },
  
  description: {
    component: Textarea,
    label: 'Description',
    placeholder: 'Describe your case',
    defaultValue: '',
    ui: { gridSpan: 2, section: 'case' },
  },
  
  // Contact fields
  email: {
    component: EmailInput,
    label: 'Email',
    placeholder: 'your.email@example.com',
    defaultValue: '',
    ui: { gridSpan: 1, section: 'contact' },
  },
  
  businessEmail: {
    component: EmailInput,
    label: 'Business Email',
    placeholder: 'business@example.com',
    defaultValue: '',
    ui: { gridSpan: 1, section: 'contact' },
  },
  
  phone: {
    component: PhoneInput,
    label: 'Phone',
    placeholder: '+1 (555) 123-4567',
    defaultValue: '',
    ui: { gridSpan: 1, section: 'contact' },
  },
  
  contactPhone: {
    component: PhoneInput,
    label: 'Contact Phone',
    placeholder: '+1 (555) 123-4567',
    defaultValue: '',
    ui: { gridSpan: 1, section: 'contact' },
  },
  
  // Client-specific fields
  status: {
    component: Select,
    label: 'Status',
    placeholder: 'Select status',
    defaultValue: 'lead',
    options: STATUS_OPTIONS,
    ui: { gridSpan: 1, section: 'client' },
  },
  
  currency: {
    component: Select,
    label: 'Currency',
    placeholder: 'Select currency',
    defaultValue: 'usd',
    options: CURRENCY_OPTIONS,
    ui: { gridSpan: 1, section: 'client' },
  },
  
  // Address field (special case)
  address: {
    component: AddressInput,
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
export function getDefaultValues(fieldIds: string[]): Record<string, any> {
  const defaults: Record<string, any> = {};
  
  for (const fieldId of fieldIds) {
    const entry = getFieldEntry(fieldId);
    defaults[fieldId] = entry.defaultValue;
  }
  
  return defaults;
}

// Helper to apply field adapters
export function applyFieldAdapter(fieldId: string, value: any): any {
  const entry = getFieldEntry(fieldId);
  
  if (entry.adapter?.toFormValue) {
    return entry.adapter.toFormValue(value);
  }
  
  return value;
}

// Helper to reverse field adapters (for form submission)
export function reverseFieldAdapter(fieldId: string, value: any): any {
  const entry = getFieldEntry(fieldId);
  
  if (entry.adapter?.fromFormValue) {
    return entry.adapter.fromFormValue(value);
  }
  
  return value;
}
