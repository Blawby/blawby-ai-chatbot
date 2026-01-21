import { PLATFORM_SETTINGS } from '@/config/platform';

const PLATFORM_IDS = new Set([PLATFORM_SETTINGS.id].filter(Boolean));

export function isPlatformPractice(identifier?: string | null): boolean {
  if (!identifier) {
    return false;
  }
  return PLATFORM_IDS.has(identifier);
}
