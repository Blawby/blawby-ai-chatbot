import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { cn } from '@/shared/utils/cn';

export interface InfiniteScrollProps {
  children: ComponentChildren;
  onLoadMore: () => void;
  hasMore: boolean;
  loading?: boolean;
  loader?: ComponentChildren;
  threshold?: number;
  className?: string;
}

export function InfiniteScroll({
  children,
  onLoadMore,
  hasMore,
  loading = false,
  loader,
  threshold = 200,
  className,
}: InfiniteScrollProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore || loading) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) onLoadMore();
      },
      { rootMargin: `${threshold}px` },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loading, onLoadMore, threshold]);

  return (
    <div className={cn('flex flex-col', className)}>
      {children}
      <div ref={sentinelRef} className="shrink-0" />
      {loading && (
        <div className="flex items-center justify-center py-4">
          {loader ?? (
            <div className="w-5 h-5 border-2 border-accent-500/30 border-t-accent-500 rounded-full animate-spin" />
          )}
        </div>
      )}
    </div>
  );
}
