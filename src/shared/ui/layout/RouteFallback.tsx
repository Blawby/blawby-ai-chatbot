import { LoadingBlock } from './LoadingBlock';

/**
 * Canonical fallback for `<Suspense fallback={...}>` around lazy-loaded
 * route subviews. Centered LoadingBlock with route-appropriate padding —
 * keeps every lazy boundary visually consistent.
 *
 * If a particular boundary needs different padding, drop a LoadingBlock
 * inline with the desired className instead of customising this.
 */
export const RouteFallback = () => <LoadingBlock className="p-6" />;
