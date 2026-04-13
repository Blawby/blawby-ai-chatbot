import { getConversationParticipants, type ConversationParticipant } from '@/shared/lib/apiClient';

export type ParticipantRecord = ConversationParticipant;

const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_ENTRIES = 50;

type CacheEntry = {
 value: ParticipantRecord[];
 expiresAt: number;
 lastAccessedAt: number;
};

const participantCache = new Map<string, CacheEntry>();
const participantInflight = new Map<string, Promise<ParticipantRecord[]>>();
const participantGenerations = new Map<string, number>();
let participantGenerationCounter = 0;

let authClearListenerRegistered = false;

const getCacheKey = (practiceId: string, conversationId: string) => `${practiceId}::${conversationId}`;
const getGeneration = (key: string) => participantGenerations.get(key) ?? participantGenerationCounter;

const pruneExpiredEntries = (now: number) => {
 for (const [key, entry] of participantCache.entries()) {
  if (entry.expiresAt <= now) {
   participantCache.delete(key);
  }
 }

 for (const key of participantGenerations.keys()) {
  if (!participantCache.has(key) && !participantInflight.has(key)) {
   participantGenerations.delete(key);
  }
 }
};

const pruneOverflowEntries = () => {
 if (participantCache.size <= MAX_CACHE_ENTRIES) return;

 const entriesByAge = [...participantCache.entries()].sort(
  (left, right) => left[1].lastAccessedAt - right[1].lastAccessedAt
 );

 while (entriesByAge.length > 0 && participantCache.size > MAX_CACHE_ENTRIES) {
  const oldest = entriesByAge.shift();
  if (!oldest) break;
  participantCache.delete(oldest[0]);
 }
};

const ensureGlobalListeners = () => {
 if (authClearListenerRegistered || typeof window === 'undefined') return;

 const clearCache = () => clearParticipants();
 window.addEventListener('auth:session-cleared', clearCache);
 authClearListenerRegistered = true;
};

export async function getParticipants(practiceId: string, conversationId: string): Promise<ParticipantRecord[]> {
 const normalizedPracticeId = practiceId.trim();
 const normalizedConversationId = conversationId.trim();

 if (!normalizedPracticeId) {
  throw new Error('practiceId is required');
 }
 if (!normalizedConversationId) {
  throw new Error('conversationId is required');
 }

 ensureGlobalListeners();

 const key = getCacheKey(normalizedPracticeId, normalizedConversationId);
 const generation = getGeneration(key);
 const now = Date.now();
 pruneExpiredEntries(now);

 const cached = participantCache.get(key);
 if (cached && cached.expiresAt > now) {
  cached.lastAccessedAt = now;
  return cached.value;
 }

 const inflight = participantInflight.get(key);
 if (inflight) {
  return inflight;
 }

 const request = getConversationParticipants(normalizedConversationId, normalizedPracticeId)
  .then((participants) => {
   const nextNow = Date.now();
   if (getGeneration(key) === generation) {
    participantCache.set(key, {
     value: participants,
     expiresAt: nextNow + CACHE_TTL_MS,
     lastAccessedAt: nextNow,
    });
   }
   pruneExpiredEntries(nextNow);
   pruneOverflowEntries();
   return participants;
  })
  .finally(() => {
   if (participantInflight.get(key) === request) {
    participantInflight.delete(key);
   }
   if (!participantCache.has(key) && !participantInflight.has(key)) {
    participantGenerations.delete(key);
   }
  });

 participantInflight.set(key, request);
 return request;
}

export function invalidateParticipants(practiceId: string, conversationId?: string): void {
 const normalizedPracticeId = practiceId.trim();
 if (!normalizedPracticeId) return;

 if (conversationId) {
  const normalizedConversationId = conversationId.trim();
  if (!normalizedConversationId) return;
  const key = getCacheKey(normalizedPracticeId, normalizedConversationId);
  const nextGeneration = getGeneration(key) + 1;
  participantCache.delete(key);
  participantGenerations.delete(key);
  participantInflight.delete(key);
  participantGenerations.set(key, nextGeneration);
  return;
 }

 const prefix = `${normalizedPracticeId}::`;
 const matchingKeys = new Set([
  ...[...participantCache.keys()].filter((key) => key.startsWith(prefix)),
  ...[...participantInflight.keys()].filter((key) => key.startsWith(prefix)),
 ]);

 for (const key of matchingKeys) {
  const nextGeneration = getGeneration(key) + 1;
  participantCache.delete(key);
  participantGenerations.delete(key);
  participantInflight.delete(key);
  participantGenerations.set(key, nextGeneration);
 }
}

export function clearParticipants(): void {
 participantGenerationCounter += 1;
 participantCache.clear();
 participantInflight.clear();
 participantGenerations.clear();
}
