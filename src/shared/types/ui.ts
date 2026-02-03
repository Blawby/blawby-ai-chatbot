// Canonical UI types - camelCase, address/apartment naming
export interface Address {
  address: string;
  apartment?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

// Address suggestion from autocomplete API
export interface AddressSuggestion {
  id: string;
  label: string;
  address: Address;
  formatted: string;
  lat?: number;
  lon?: number;
  placeId?: string;
  dedupeKey: string;
  properties?: Record<string, unknown>;
}

// Domain UI types
export interface IntakeForm {
  name: string;
  email: string;
  phone: string;
  address?: Address;
  opposingParty?: string;
  description?: string;
}

export interface ClientForm {
  name: string;
  email: string;
  phone: string;
  status: 'lead' | 'active' | 'inactive' | 'archived';
  currency: 'usd' | 'cad' | 'eur' | 'gbp';
  address?: Address;
}

export interface PracticeForm {
  businessEmail: string;
  contactPhone: string;
  address?: Address;
}

// Form state types (partial for editing)
export type IntakeFormState = Partial<IntakeForm>;
export type ClientFormState = Partial<ClientForm>;
export type PracticeFormState = Partial<PracticeForm>;
