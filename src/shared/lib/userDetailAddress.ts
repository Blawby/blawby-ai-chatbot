import type { Address } from '@/shared/types/address';
const readText = (value: unknown): string => typeof value === 'string' ? value.trim() : '';

export const readUserDetailAddress = (detail: unknown): Address | null => {
  if (!detail || typeof detail !== 'object') return null;
  const record = detail as Record<string, unknown>;
  const nestedAddress = record.address;
  const source = nestedAddress && typeof nestedAddress === 'object'
    ? nestedAddress as Record<string, unknown>
    : record;

  const address = readText(source.address ?? source.line1);
  const apartment = readText(source.apartment ?? source.line2);
  const city = readText(source.city);
  const state = readText(source.state);
  const postalCode = readText(source.postalCode ?? source.postal_code);
  const country = readText(source.country);

  if (!address && !apartment && !city && !state && !postalCode && !country) {
    return null;
  }

  return {
    address,
    apartment: apartment || undefined,
    city,
    state,
    postalCode,
    country,
  };
};

export const hasRenderableUserDetailAddress = (value: unknown): value is Address => {
  // Delegate to readUserDetailAddress which normalizes nested address shapes
  try {
    const resolved = readUserDetailAddress(value);
    return resolved !== null;
  } catch (_err) {
    return false;
  }
};

export const formatUserDetailAddressDisplay = (value: Address | null | undefined): string | null => {
  if (!value) return null;
  const parts = [
    value.address,
    value.apartment ?? '',
    [value.city, value.state, value.postalCode].filter(Boolean).join(' '),
    value.country,
  ].map((part) => part.trim()).filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : null;
};
