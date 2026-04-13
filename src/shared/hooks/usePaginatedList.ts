import { useEffect, useMemo, useRef, useState } from 'preact/hooks';

type PageResult<T> = {
 items: T[];
 hasMore: boolean;
};

export type UsePaginatedListOptions<T extends { id: string }> = {
 fetchPage: (page: number, signal: AbortSignal) => Promise<PageResult<T>>;
 deps: unknown[];
};

export type UsePaginatedListResult<T extends { id: string }> = {
 items: T[];
 isLoading: boolean;
 isLoadingMore: boolean;
 error: string | null;
 hasMore: boolean;
 loadMoreRef: { current: HTMLDivElement | null };
};

export function usePaginatedList<T extends { id: string }>(
 options: UsePaginatedListOptions<T>
): UsePaginatedListResult<T> {
 const { fetchPage, deps } = options;
 const [page, setPage] = useState(1);
 const [items, setItems] = useState<T[]>([]);
 const [hasMore, setHasMore] = useState(true);
 const [isLoading, setIsLoading] = useState(true);
 const [isLoadingMore, setIsLoadingMore] = useState(false);
 const [error, setError] = useState<string | null>(null);
 const loadMoreRef = useRef<HTMLDivElement | null>(null);
 const fetchRequestIdRef = useRef(0);
 const fetchPageRef = useRef(fetchPage);

 useEffect(() => {
  fetchPageRef.current = fetchPage;
 }, [fetchPage]);

 const [resetCounter, setResetCounter] = useState(0);

 useEffect(() => {
  setResetCounter((c) => c + 1);
  setPage(1);
  setItems([]);
  setHasMore(true);
  setError(null);
  setIsLoading(true);
  setIsLoadingMore(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- reset dependencies are intentionally supplied by the caller
 }, deps);

 useEffect(() => {
  if (!hasMore && page > 1) return;
  const controller = new AbortController();
  const requestId = ++fetchRequestIdRef.current;
  setError(null);
  setIsLoading(page === 1);
  setIsLoadingMore(page > 1);

  void fetchPageRef.current(page, controller.signal)
   .then((result) => {
    if (requestId !== fetchRequestIdRef.current) return;
    setHasMore(result.hasMore);
    setItems((prev) => {
     if (page === 1) return result.items;
     const merged = [...prev, ...result.items];
     return merged.filter((item, index, arr) => arr.findIndex((candidate) => candidate.id === item.id) === index);
    });
   })
   .catch((nextError: unknown) => {
    if (requestId !== fetchRequestIdRef.current) return;
    if ((nextError as DOMException)?.name === 'AbortError') return;
    setError(nextError instanceof Error ? nextError.message : 'Failed to load data');
   })
   .finally(() => {
    if (requestId !== fetchRequestIdRef.current) return;
    setIsLoading(false);
    setIsLoadingMore(false);
   });

  return () => controller.abort();
 }, [hasMore, page, resetCounter]);

 const canObserve = useMemo(() => hasMore && !isLoading && !isLoadingMore, [hasMore, isLoading, isLoadingMore]);

 useEffect(() => {
  const target = loadMoreRef.current;
  if (!target || !canObserve) return;
  const observer = new IntersectionObserver((entries) => {
   const [entry] = entries;
   if (!entry?.isIntersecting) return;
   setPage((prev) => prev + 1);
  }, { rootMargin: '200px' });
  observer.observe(target);
  return () => observer.disconnect();
 }, [canObserve]);

 return {
  items,
  isLoading,
  isLoadingMore,
  error,
  hasMore,
  loadMoreRef
 };
}
