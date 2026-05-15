import { useEffect, useRef, useState } from 'preact/hooks';
import { searchGlobal } from '../services/searchApi';
import type { SearchEnvelope } from '../services/searchTypes';

const DEBOUNCE_MS = 180;

type State = {
  envelope: SearchEnvelope | null;
  loading: boolean;
  error: string | null;
};

export function useGlobalSearch(practiceId: string | null, query: string): State {
  const [state, setState] = useState<State>({ envelope: null, loading: false, error: null });
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!practiceId || query.trim().length === 0) {
      setState({ envelope: null, loading: false, error: null });
      return;
    }

    const timer = window.setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setState((prev) => ({ ...prev, loading: true, error: null }));

      searchGlobal(practiceId, query, { signal: controller.signal })
        .then((envelope) => {
          if (!controller.signal.aborted) {
            setState({ envelope, loading: false, error: null });
          }
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          const message = error instanceof Error ? error.message : 'Search failed';
          setState({ envelope: null, loading: false, error: message });
        });
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      abortRef.current?.abort();
    };
  }, [practiceId, query]);

  return state;
}
