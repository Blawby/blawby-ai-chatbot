import { DEFAULT_ORGANIZATION_ID, DEFAULT_PLATFORM_SLUG } from './constants';
import { PLATFORM_SETTINGS } from '../config/platform';

const PLATFORM_IDS = new Set(
  [DEFAULT_ORGANIZATION_ID, PLATFORM_SETTINGS.id].filter(Boolean)
);

const PLATFORM_SLUGS = new Set(
  [DEFAULT_PLATFORM_SLUG, PLATFORM_SETTINGS.slug, 'public', 'platform-defaults']
    .filter(Boolean)
    .map((slug) => slug!.toLowerCase())
);

export function isPlatformOrganization(identifier?: string | null): boolean {
  if (!identifier) {
    return false;
  }
  if (PLATFORM_IDS.has(identifier)) {
    return true;
  }
  const normalized = identifier.toLowerCase();
  return PLATFORM_SLUGS.has(normalized);
}
