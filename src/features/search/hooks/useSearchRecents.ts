import { useCallback, useEffect, useState } from 'preact/hooks';

const MAX_RECENTS = 8;

function storageKey(practiceId: string, userId: string): string {
  return `search:recents:${practiceId}:${userId}`;
}

function readSafe(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === 'string');
  } catch {
    return [];
  }
}

function writeSafe(key: string, values: string[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(values.slice(0, MAX_RECENTS)));
  } catch {
    /* localStorage may be unavailable */
  }
}

export function useSearchRecents(
  practiceId: string | null,
  userId: string | null,
): {
  recents: string[];
  push: (query: string) => void;
  clear: () => void;
} {
  const key = practiceId && userId ? storageKey(practiceId, userId) : null;
  const [recents, setRecents] = useState<string[]>([]);

  useEffect(() => {
    if (!key) {
      setRecents([]);
      return;
    }
    setRecents(readSafe(key));
  }, [key]);

  const push = useCallback(
    (query: string) => {
      if (!key) return;
      const trimmed = query.trim();
      if (trimmed.length === 0) return;
      setRecents((prev) => {
        const next = [trimmed, ...prev.filter((q) => q !== trimmed)].slice(0, MAX_RECENTS);
        writeSafe(key, next);
        return next;
      });
    },
    [key],
  );

  const clear = useCallback(() => {
    if (!key) return;
    setRecents([]);
    writeSafe(key, []);
  }, [key]);

  return { recents, push, clear };
}
