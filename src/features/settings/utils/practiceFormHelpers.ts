import type { Address } from '@/shared/types/address';

export const formatSlug = (raw: string): string =>
  raw
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

export const mapAddressSource = (src: string | Record<string, unknown> | null | undefined) => {
  if (typeof src === 'string') return { address: src };
  if (!src || typeof src !== 'object') return {};
  const s = src as Record<string, unknown>;
  return {
    address: (s.address ?? s.line1 ?? s.address_line ?? '') as string | null,
    apartment: (s.apartment ?? s.unit ?? '') as string | null,
    city: (s.city ?? '') as string | null,
    state: (s.state ?? '') as string | null,
    postalCode: (s.postalCode ?? s.postal_code ?? '') as string | null,
    country: (s.country ?? '') as string | null,
  };
};

export const buildAddress = (source: {
  address?: string | null;
  apartment?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
}): Address | undefined => {
  const address = source.address?.trim() || '';
  const apartment = source.apartment?.trim() || undefined;
  const city = source.city?.trim() || '';
  const state = source.state?.trim() || '';
  const postalCode = source.postalCode?.trim() || '';
  const country = source.country?.trim() || '';
  const hasAny = Boolean(address || apartment || city || state || postalCode || country);
  if (!hasAny) return undefined;
  return { address, apartment, city, state, postalCode, country };
};
