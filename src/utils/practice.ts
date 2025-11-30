import { DEFAULT_PRACTICE_ID, DEFAULT_PLATFORM_SLUG } from './constants';
import { PLATFORM_SETTINGS } from '../config/platform';

const PLATFORM_IDS = new Set(
  [DEFAULT_PRACTICE_ID, PLATFORM_SETTINGS.id].filter(Boolean)
);

const PLATFORM_SLUGS = new Set(
  [DEFAULT_PLATFORM_SLUG, PLATFORM_SETTINGS.slug, 'public', 'platform-defaults']
    .filter(Boolean)
    .map((slug) => slug!.toLowerCase())
);

export function isPlatformPractice(identifier?: string | null): boolean {
  if (!identifier) {
    return false;
  }
  if (PLATFORM_IDS.has(identifier)) {
    return true;
  }
  const normalized = identifier.toLowerCase();
  return PLATFORM_SLUGS.has(normalized);
}
