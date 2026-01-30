import type { PracticeDetailsUpdate, UpdatePracticeRequest } from '@/shared/lib/apiClient';
import { asMajor, type MajorAmount } from '@/shared/utils/money';

export type PracticeProfileInput = {
  name?: string | null;
  slug?: string | null;
  logo?: string | null;
  businessEmail?: string | null;
  businessPhone?: string | null;
  consultationFee?: MajorAmount | null;
  description?: string | null;
  website?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  introMessage?: string | null;
  isPublic?: boolean;
  services?: Array<Record<string, unknown>> | null;
};

export type PracticeProfileComparison = Partial<PracticeProfileInput>;

export type PracticeProfilePayloads = {
  practicePayload: UpdatePracticeRequest;
  detailsPayload: PracticeDetailsUpdate;
};

const normalizeRequiredText = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const normalizeOptionalText = (value: unknown): string | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeNumber = (value: unknown): MajorAmount | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return typeof value === 'number' && Number.isFinite(value) ? asMajor(value) : undefined;
};

const shouldInclude = (next: unknown, current: unknown): boolean => {
  if (current === undefined) return true;
  return next !== current;
};

export const buildPracticeProfilePayloads = (
  input: PracticeProfileInput,
  options: { compareTo?: PracticeProfileComparison } = {}
): PracticeProfilePayloads => {
  const compareTo = options.compareTo ?? {};
  const practicePayload: UpdatePracticeRequest = {};
  const detailsPayload: PracticeDetailsUpdate = {};

  const name = normalizeRequiredText(input.name);
  if (name && shouldInclude(name, normalizeRequiredText(compareTo.name))) {
    practicePayload.name = name;
  }

  const slug = normalizeRequiredText(input.slug);
  if (slug && shouldInclude(slug, normalizeRequiredText(compareTo.slug))) {
    practicePayload.slug = slug;
  }

  const logo = normalizeRequiredText(input.logo);
  if (logo && shouldInclude(logo, normalizeRequiredText(compareTo.logo))) {
    practicePayload.logo = logo;
  }


  const businessEmail = normalizeOptionalText(input.businessEmail);
  if (businessEmail !== undefined && shouldInclude(businessEmail, normalizeOptionalText(compareTo.businessEmail))) {
    detailsPayload.businessEmail = businessEmail;
  }

  const businessPhone = normalizeOptionalText(input.businessPhone);
  if (businessPhone !== undefined && shouldInclude(businessPhone, normalizeOptionalText(compareTo.businessPhone))) {
    detailsPayload.businessPhone = businessPhone;
  }

  const consultationFee = normalizeNumber(input.consultationFee);
  if (consultationFee !== undefined && shouldInclude(consultationFee, normalizeNumber(compareTo.consultationFee))) {
    detailsPayload.consultationFee = consultationFee;
  }

  const website = normalizeOptionalText(input.website);
  if (website !== undefined && shouldInclude(website, normalizeOptionalText(compareTo.website))) {
    detailsPayload.website = website;
  }

  const addressLine1 = normalizeOptionalText(input.addressLine1);
  if (addressLine1 !== undefined && shouldInclude(addressLine1, normalizeOptionalText(compareTo.addressLine1))) {
    detailsPayload.addressLine1 = addressLine1;
  }

  const addressLine2 = normalizeOptionalText(input.addressLine2);
  if (addressLine2 !== undefined && shouldInclude(addressLine2, normalizeOptionalText(compareTo.addressLine2))) {
    detailsPayload.addressLine2 = addressLine2;
  }

  const city = normalizeOptionalText(input.city);
  if (city !== undefined && shouldInclude(city, normalizeOptionalText(compareTo.city))) {
    detailsPayload.city = city;
  }

  const state = normalizeOptionalText(input.state);
  if (state !== undefined && shouldInclude(state, normalizeOptionalText(compareTo.state))) {
    detailsPayload.state = state;
  }

  const postalCode = normalizeOptionalText(input.postalCode);
  if (postalCode !== undefined && shouldInclude(postalCode, normalizeOptionalText(compareTo.postalCode))) {
    detailsPayload.postalCode = postalCode;
  }

  const country = normalizeOptionalText(input.country);
  if (country !== undefined && shouldInclude(country, normalizeOptionalText(compareTo.country))) {
    detailsPayload.country = country;
  }

  const introMessage = normalizeOptionalText(input.introMessage);
  if (introMessage !== undefined && shouldInclude(introMessage, normalizeOptionalText(compareTo.introMessage))) {
    detailsPayload.introMessage = introMessage;
  }

  const description = normalizeOptionalText(input.description);
  if (description !== undefined && shouldInclude(description, normalizeOptionalText(compareTo.description))) {
    detailsPayload.description = description;
  }

  if (typeof input.isPublic === 'boolean') {
    const currentValue = typeof compareTo.isPublic === 'boolean' ? compareTo.isPublic : undefined;
    if (shouldInclude(input.isPublic, currentValue)) {
      detailsPayload.isPublic = input.isPublic;
    }
  }

  if (Array.isArray(input.services)) {
    detailsPayload.services = input.services;
  }

  return { practicePayload, detailsPayload };
};
