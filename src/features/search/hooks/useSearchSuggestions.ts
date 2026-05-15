import { useEffect, useRef, useState } from 'preact/hooks';
import { fetchSearchSuggestions } from '../services/searchApi';
import type { SearchSuggestion } from '../services/searchTypes';

const DEBOUNCE_MS = 120;

export function useSearchSuggestions(
  practiceId: string | null,
  prefix: string,
): SearchSuggestion[] {
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!practiceId || prefix.trim().length === 0) {
      setSuggestions([]);
      return;
    }
    const timer = window.setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      fetchSearchSuggestions(practiceId, prefix, { signal: controller.signal })
        .then((next) => {
          if (!controller.signal.aborted) setSuggestions(next);
        })
        .catch(() => {
          /* ignore — suggestions are non-critical */
        });
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      abortRef.current?.abort();
    };
  }, [practiceId, prefix]);

  return suggestions;
}
