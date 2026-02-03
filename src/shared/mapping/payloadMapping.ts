import { toApiAddress } from './addressMapping';
import type { IntakeForm, ClientForm, PracticeForm } from '../types/ui';
import type { 
  CreateIntakeRequestApi, 
  CreateClientRequestApi, 
  UpdateClientRequestApi,
  CreatePracticeRequestApi,
  UpdatePracticeRequestApi 
} from '../types/api';

// Intake form mappers
export function toCreateIntakeRequest(ui: IntakeForm): CreateIntakeRequestApi {
  return {
    name: ui.name,
    email: ui.email,
    phone: ui.phone,
    address: ui.address ? toApiAddress(ui.address) : undefined,
    opposing_party: ui.opposingParty,
    description: ui.description,
  };
}

// Client form mappers
export function toCreateClientRequest(ui: ClientForm): CreateClientRequestApi {
  return {
    name: ui.name,
    email: ui.email,
    phone: ui.phone,
    status: ui.status,
    currency: ui.currency,
    address: ui.address ? toApiAddress(ui.address) : undefined,
  };
}

export function toUpdateClientRequest(ui: ClientForm): UpdateClientRequestApi {
  return {
    name: ui.name,
    email: ui.email,
    phone: ui.phone,
    status: ui.status,
    currency: ui.currency,
    address: ui.address ? toApiAddress(ui.address) : undefined,
  };
}

// Practice form mappers
export function toCreatePracticeRequest(ui: PracticeForm): CreatePracticeRequestApi {
  return {
    business_email: ui.businessEmail,
    contact_phone: ui.contactPhone,
    address: ui.address ? toApiAddress(ui.address) : undefined,
  };
}

export function toUpdatePracticeRequest(ui: PracticeForm): UpdatePracticeRequestApi {
  return {
    business_email: ui.businessEmail,
    contact_phone: ui.contactPhone,
    address: ui.address ? toApiAddress(ui.address) : undefined,
  };
}
