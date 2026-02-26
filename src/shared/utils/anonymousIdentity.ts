const STORAGE_KEY = 'blawby:lastAnonUserId';

export const rememberAnonymousUserId = (userId: string | null | undefined): void => {
  if (typeof window === 'undefined') return;
  if (!userId) return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, userId);
  } catch {
    // sessionStorage may be unavailable (private mode, iframe restrictions, etc.)
  }
};

export const consumeAnonymousUserId = (): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    const value = window.sessionStorage.getItem(STORAGE_KEY);
    if (value) {
      window.sessionStorage.removeItem(STORAGE_KEY);
    }
    return value;
  } catch {
    return null;
  }
};

export const peekAnonymousUserId = (): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};
