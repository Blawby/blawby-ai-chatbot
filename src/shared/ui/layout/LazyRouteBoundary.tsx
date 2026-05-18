import type { ComponentChildren } from 'preact';
import { Suspense } from 'preact/compat';
import { ErrorBoundary } from '@/app/ErrorBoundary';
import { Button } from '@/shared/ui/Button';
import { RouteFallback } from './RouteFallback';

const ChunkLoadFallback = () => (
  <div className="m-6 rounded-xl border border-accent-error/30 bg-accent-error/5 p-6 text-sm text-input-text">
    <p className="font-semibold">This page failed to load.</p>
    <p className="mt-1 text-input-placeholder">
      A code chunk could not be downloaded. Reload to try again.
    </p>
    <Button
      variant="primary"
      className="mt-4"
      onClick={() => { if (typeof window !== 'undefined') window.location.reload(); }}
    >
      Reload
    </Button>
  </div>
);

/**
 * Wraps a lazy-loaded route subview in BOTH a Suspense fallback (for the
 * initial chunk download) AND an ErrorBoundary (for chunk-load failures
 * after the boundary mounts). Replaces the bare `<Suspense fallback={<RouteFallback/>}>`
 * pattern so a failed dynamic import never produces a blank screen.
 */
export const LazyRouteBoundary = ({ children }: { children: ComponentChildren }) => (
  <ErrorBoundary fallback={<ChunkLoadFallback />}>
    <Suspense fallback={<RouteFallback />}>{children}</Suspense>
  </ErrorBoundary>
);
