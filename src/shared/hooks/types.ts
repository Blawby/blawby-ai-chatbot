/**
 * Canonical async-data contract for data-fetching hooks.
 *
 * - `data` is `undefined` until the first successful response. After that,
 *   it stays defined across refetches — never reset to `undefined` on a
 *   background refresh.
 * - `isLoading` is true only while no `data` has ever been received (first
 *   load). It is permanently `false` after the first response.
 * - `isFetching` is true whenever a request is in flight, including
 *   refetches and background revalidations. It is a strict superset of
 *   `isLoading`: `isLoading=true` implies `isFetching=true`.
 *
 * This split lets list views render `isLoading ? <Skeleton/> : <List/>`
 * for first paint and `isFetching && <RefreshIndicator/>` inline for
 * subsequent fetches, without ever wiping existing data.
 */
export type AsyncState<T> = {
  data: T | undefined;
  error: string | null;
  isLoading: boolean;
  isFetching: boolean;
  refetch: () => Promise<void>;
};
