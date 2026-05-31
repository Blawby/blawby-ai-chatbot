/**
 * Persisted onboarding draft helpers.
 *
 * The 6-step conversational onboarding collects answers across multiple
 * steps. Persisting a draft to localStorage means a reload (or accidental
 * navigation) doesn't lose the user's answers. A 7-day TTL guards against
 * stale drafts hanging around forever; `handleComplete` clears the draft
 * once onboarding is finished.
 */

import type { OnboardingDraft } from '../types';

const STORAGE_KEY = 'blawby:onboarding-draft';
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface StoredDraft {
  /** Epoch ms — used to expire drafts after TTL_MS. */
  savedAt: number;
  /** The draft payload. */
  draft: OnboardingDraft;
}

/** Read the persisted draft. Returns null if missing, expired, or unreadable. */
export function readDraft(): OnboardingDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredDraft> | null;
    if (!parsed || typeof parsed.savedAt !== 'number' || !parsed.draft) {
      return null;
    }
    if (Date.now() - parsed.savedAt > TTL_MS) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed.draft;
  } catch {
    return null;
  }
}

/** Persist the draft. Silently swallows write failures (e.g. quota). */
export function writeDraft(draft: OnboardingDraft): void {
  if (typeof window === 'undefined') return;
  try {
    const payload: StoredDraft = { savedAt: Date.now(), draft };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore — localStorage may be disabled or full.
  }
}

/** Clear the draft. Call after `handleComplete` succeeds. */
export function clearDraft(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore.
  }
}
