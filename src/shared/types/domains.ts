import type { Address } from './address';

// Canonical domain models - one per entity
export interface IntakePayload {
  name: string;
  email: string;
  phone: string;
  address?: Address;
  opposingParty?: string;
  description?: string;
}

export interface ClientPayload {
  name: string;
  email: string;
  phone: string;
  status: 'lead' | 'active' | 'inactive' | 'archived';
  currency: 'usd' | 'cad' | 'eur' | 'gbp';
  address?: Address;
}

export interface PracticePayload {
  businessEmail: string;
  contactPhone: string;
  address?: Address;
}

// Form state types (partial for editing)
export type IntakeFormState = Partial<IntakePayload>;
export type ClientFormState = Partial<ClientPayload>;
export type PracticeFormState = Partial<PracticePayload>;
