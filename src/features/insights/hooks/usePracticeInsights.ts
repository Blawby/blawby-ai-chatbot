import { useQuery } from '@/shared/hooks/useQuery';
import { policyTtl } from '@/shared/lib/cachePolicy';
import {
  practiceInsightsApi,
  type ClientCheckinInsight,
  type MatterRiskInsight,
} from '@/features/insights/services/practiceInsightsApi';

export const useClientCheckins = (practiceId: string) => {
  const key = `practice-insights:${practiceId}:client-checkins`;
  return useQuery<ClientCheckinInsight[]>({
    key,
    fetcher: (signal) => practiceInsightsApi.getClientCheckins(practiceId, signal),
    ttl: policyTtl(key),
    enabled: Boolean(practiceId),
    swr: false,
  });
};

export const useMatterRisks = (practiceId: string) => {
  const key = `practice-insights:${practiceId}:matter-risk`;
  return useQuery<MatterRiskInsight[]>({
    key,
    fetcher: (signal) => practiceInsightsApi.getMatterRisks(practiceId, signal),
    ttl: policyTtl(key),
    enabled: Boolean(practiceId),
    swr: false,
  });
};
