const PRACTICE_INVITE_LINK_STORAGE_KEY = 'pending_practice_invite_link';

export const storePendingPracticeInviteLink = (link: string): void => {
  if (typeof window === 'undefined') return;
  if (!link || !link.trim()) return;
  window.sessionStorage.setItem(PRACTICE_INVITE_LINK_STORAGE_KEY, link.trim());
};

export const readPendingPracticeInviteLink = (): string | null => {
  if (typeof window === 'undefined') return null;
  return window.sessionStorage.getItem(PRACTICE_INVITE_LINK_STORAGE_KEY);
};

export const clearPendingPracticeInviteLink = (): void => {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(PRACTICE_INVITE_LINK_STORAGE_KEY);
};
