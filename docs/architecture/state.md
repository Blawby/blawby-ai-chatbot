# State management

This codebase has four state primitives. Pick the one that matches your
data's *scope* and *frequency*, not the one you're most familiar with.

## When to use which

| Primitive | Use for |
|---|---|
| `useState` | Ephemeral UI state scoped to one component (open/closed, hover, draft text, loading flags that no other component reads). |
| `useSignal` (`@preact/signals`) | Form fields, draft text, anything that updates often and only the local component cares. The shared `<Form>` (`src/shared/ui/form/Form.tsx`) runs on signals so individual fields don't re-render the whole form. |
| `queryCache` (via `useQuery`) | Cross-component server-state: anything fetched from the API. Single source of truth — see `src/shared/lib/queryCache.ts`. Don't introduce ad-hoc nanostore atoms for cached data; use `queryCache.set` / `useQuery` instead. |
| React Context | Auth, scope, route identity, toast surface. Stable through the session, read by many components, written by very few. |

## Surviving contexts

Only these contexts are sanctioned. Adding a new context needs a clear
reason in the PR description:

- `SessionContext` — current session + user
- `MemberRoleContext` — active practice membership role
- `RoutePracticeContext` — practice id resolved from the URL
- `ToastContext` — toast surface (write side)
- `IntakeContext` — intake-flow state passed through the chat tree (one
  caller; legacy)

Anything else should be a `queryCache` entry, a nanostore atom, or
component-local state.

## Anti-patterns enforced by ESLint

- **Inline object literal as Provider value.**
  `<X.Provider value={{ a, b }}>` creates a fresh identity every render
  and re-renders every consumer. Wrap in `useMemo` or a stable ref.
  Caught by `custom/no-inline-context-value`.

- **Re-declaring `Backend*` types outside `worker/types/wire/`.**
  Wire types live in one place. Caught by `no-restricted-syntax`.

## Common refactor patterns

- **A context just to share fetched data?** Replace with `useQuery` keyed
  by the resource id. Multiple components subscribing to the same key
  share the cache entry without a context.

- **A nanostores atom that wraps a Map of `id → data` you populate from
  fetches?** Replace with `queryCache` entries — it already does
  in-flight dedup, LRU, and generation-safe writes.

- **`useState` for state that two siblings need to read?** Lift it to
  the nearest common ancestor as `useState`, OR — if it's
  server-derived — read it via `useQuery` in both siblings.

## Why this is enforced

Three patterns we hit before the cleanup:

1. The same fetched data cached in 4 places (apiClient Map, nanostore
   atom, queryCache atom, KV) with different TTLs and no invalidation
   coordination. **Fix:** one cache primitive per layer (queryCache on
   the frontend, edgeCache on the worker).

2. A context provider passing a fresh object literal as `value=` on
   every render, forcing every consumer to re-render. **Fix:** lint
   rule + `useMemo`.

3. `useState` used for cross-component server state, leading to
   inconsistent views (component A's data refreshes, component B
   shows the stale snapshot). **Fix:** `useQuery`.

If you're tempted to break any of these rules, write the reason in the
commit message. Future-you will thank you.
