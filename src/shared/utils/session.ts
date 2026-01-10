import type { SessionContextValue } from '@/shared/contexts/SessionContext';

export const getActiveOrganizationId = (
  session: SessionContextValue['session'] | null | undefined
): string | null => {
  const sessionRecord = session?.session as Record<string, unknown> | undefined;
  const candidate =
    typeof sessionRecord?.activeOrganizationId === 'string'
      ? sessionRecord.activeOrganizationId
      : typeof sessionRecord?.active_organization_id === 'string'
        ? sessionRecord.active_organization_id
        : null;

  if (typeof candidate === 'string' && candidate.trim().length > 0) {
    return candidate;
  }

  return null;
};
