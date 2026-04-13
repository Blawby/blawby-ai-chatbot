import type {
 ConversationMetadata,
 SetupAddressPayload,
 SetupFieldsPayload,
 SetupServicePayload,
} from '@/shared/types/conversation';

export const EMPTY_SETUP_FIELDS: SetupFieldsPayload = Object.freeze({}) as SetupFieldsPayload;

const normalizeString = (value: unknown): string | undefined => {
 if (typeof value !== 'string') return undefined;
 const trimmed = value.trim();
 return trimmed.length > 0 ? trimmed : undefined;
};

const normalizeAddress = (value: unknown): SetupAddressPayload | undefined => {
 if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
 const record = value as Record<string, unknown>;
 const next: SetupAddressPayload = {};

 const address = normalizeString(record.address);
 const apartment = normalizeString(record.apartment);
 const city = normalizeString(record.city);
 const state = normalizeString(record.state);
 const postalCode = normalizeString(record.postalCode);
 const country = normalizeString(record.country);

 if (address) next.address = address;
 if (apartment) next.apartment = apartment;
 if (city) next.city = city;
 if (state) next.state = state;
 if (postalCode) next.postalCode = postalCode;
 if (country) next.country = country;

 return Object.keys(next).length > 0 ? next : undefined;
};

const normalizeServices = (value: unknown): SetupServicePayload[] | undefined => {
 if (!Array.isArray(value)) return undefined;
 const services = value
  .map((service) => {
   if (!service || typeof service !== 'object' || Array.isArray(service)) return null;
   const record = service as Record<string, unknown>;
   const name = normalizeString(record.name);
   if (!name) return null;
   const key = normalizeString(record.key) ?? normalizeString(record.id) ?? normalizeString(record.service_key);
   const description = normalizeString(record.description);
   return {
    name,
    ...(key ? { key } : {}),
    ...(description ? { description } : {}),
   };
  })
  .filter((service): service is SetupServicePayload => Boolean(service));

 return services.length > 0 ? services : undefined;
};

export const resolveSetupFieldsState = (
 metadata: ConversationMetadata | null | undefined
): SetupFieldsPayload => {
 const setupFields = metadata?.setupFields;
 if (!setupFields || typeof setupFields !== 'object' || Array.isArray(setupFields)) {
  return EMPTY_SETUP_FIELDS;
 }
 return setupFields;
};

export const applySetupPatchToMetadata = (
 metadata: ConversationMetadata | null | undefined,
 patch: Partial<SetupFieldsPayload>
): ConversationMetadata => {
 const previous = metadata ?? {};
 const current = resolveSetupFieldsState(previous);

 const nextSetupFields: SetupFieldsPayload = {
  ...current,
  ...patch,
  ...(patch.address !== undefined
   ? { address: { ...(current.address ?? {}), ...patch.address } }
   : {}),
  ...(patch.services !== undefined ? { services: patch.services } : {}),
 };

 return {
  ...previous,
  setupFields: nextSetupFields,
 };
};

export const normalizeSetupFieldsPayload = (
 value: Record<string, unknown> | null | undefined
): Partial<SetupFieldsPayload> => {
 if (!value) return {};

 const next: Partial<SetupFieldsPayload> = {};

 const name = normalizeString(value.name);
 const slug = normalizeString(value.slug);
 const description = normalizeString(value.description);
 const accentColor = normalizeString(value.accentColor);
 const website = normalizeString(value.website);
 const businessEmail = normalizeString(value.businessEmail);
 const businessPhone = normalizeString(value.businessPhone) ?? normalizeString(value.contactPhone);
 const address = normalizeAddress(value.address);
 const services = normalizeServices(value.services);

 if (name) next.name = name;
 if (slug) next.slug = slug;
 if (description) next.description = description;
 if (accentColor) next.accentColor = accentColor;
 if (website) next.website = website;
 if (businessEmail) next.businessEmail = businessEmail;
 if (businessPhone) next.businessPhone = businessPhone;
 if (address) next.address = address;
 if (services) next.services = services;

 return next;
};
