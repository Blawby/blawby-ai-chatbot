import { intakePreflightApi, type IntakePreflight } from '@/features/intake/api/intakePreflightApi';
import { useQuery } from '@/shared/hooks/useQuery';
import { policyTtl } from '@/shared/lib/cachePolicy';

export const useIntakePreflight = (practiceId: string | null, intakeId: string) => {
  const key = `intake-preflight:${practiceId ?? 'none'}:${intakeId}`;
  return useQuery<IntakePreflight>({
    key,
    fetcher: (signal) => intakePreflightApi.get(practiceId ?? '', intakeId, signal),
    ttl: policyTtl(key),
    enabled: Boolean(practiceId && intakeId),
    swr: false,
  });
};
