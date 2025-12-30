import { useId } from 'preact/hooks';

/**
 * Generates a stable unique ID for a component instance.
 * The ID is generated once per component instance and remains stable across re-renders.
 * Uses Preact's useId hook for SSR-safe ID generation.
 * 
 * @param prefix - Optional prefix for the generated ID
 * @returns A stable unique ID string
 */
export function useUniqueId(prefix?: string): string {
  const id = useId();
  return prefix ? `${prefix}-${id}` : id;
}
