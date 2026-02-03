// Backend wire types - snake_case, line1/line2 (exactly match backend)
export interface AddressApi {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
}

// API request/response payloads
export interface CreateIntakeRequestApi {
  name: string;
  email: string;
  phone: string;
  address?: AddressApi;
  opposing_party?: string;
  description?: string;
}

export interface CreateClientRequestApi {
  name: string;
  email: string;
  phone: string;
  status: 'lead' | 'active' | 'inactive' | 'archived';
  currency: 'usd' | 'cad' | 'eur' | 'gbp';
  address?: AddressApi;
}

export interface CreatePracticeRequestApi {
  business_email: string;
  contact_phone: string;
  address?: AddressApi;
}

export interface UpdateClientRequestApi {
  name?: string;
  email?: string;
  phone?: string;
  status?: 'lead' | 'active' | 'inactive' | 'archived';
  currency?: 'usd' | 'cad' | 'eur' | 'gbp';
  address?: AddressApi;
}

export interface UpdatePracticeRequestApi {
  business_email?: string;
  contact_phone?: string;
  address?: AddressApi;
}
