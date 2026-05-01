import { getConversationParticipants, type ConversationParticipant } from '@/shared/lib/apiClient';
import { queryCache } from '@/shared/lib/queryCache';
import { policyTtl } from '@/shared/lib/cachePolicy';

export type ParticipantRecord = ConversationParticipant;

const cacheKey = (practiceId: string, conversationId: string) =>
  `practice:participants:${practiceId}:${conversationId}`;

export async function getParticipants(
  practiceId: string,
  conversationId: string,
): Promise<ParticipantRecord[]> {
  const normalizedPracticeId = practiceId.trim();
  const normalizedConversationId = conversationId.trim();

  if (!normalizedPracticeId) throw new Error('practiceId is required');
  if (!normalizedConversationId) throw new Error('conversationId is required');

  const key = cacheKey(normalizedPracticeId, normalizedConversationId);
  return queryCache.coalesceGet<ParticipantRecord[]>(
    key,
    () => getConversationParticipants(normalizedConversationId, normalizedPracticeId),
    { ttl: policyTtl(key) },
  );
}

/**
 * Invalidate participants for one conversation (when `conversationId` is
 * given) or every conversation under a practice (prefix match).
 */
export function invalidateParticipants(practiceId: string, conversationId?: string): void {
  const normalizedPracticeId = practiceId.trim();
  if (!normalizedPracticeId) return;

  if (conversationId) {
    const normalizedConversationId = conversationId.trim();
    if (!normalizedConversationId) return;
    queryCache.invalidate(cacheKey(normalizedPracticeId, normalizedConversationId));
    return;
  }

  queryCache.invalidate(`practice:participants:${normalizedPracticeId}:`, /* prefix */ true);
}

/**
 * Clear all participant cache entries — used on auth session clear.
 * The `auth:session-cleared` window event is also handled inside
 * `queryCache` itself, so this is now mostly a no-op kept for callers.
 */
export function clearParticipants(): void {
  queryCache.invalidate('practice:participants:', /* prefix */ true);
}
