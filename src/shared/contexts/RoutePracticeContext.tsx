import { createContext } from 'preact';
import type { ComponentChildren } from 'preact';

export interface RoutePracticeContextValue {
  practiceId: string | null;
  practiceSlug: string | null;
  workspace: 'practice' | 'client' | 'public' | null;
}

export const RoutePracticeContext = createContext<RoutePracticeContextValue | null>(null);

export function RoutePracticeProvider({
  value,
  children,
}: {
  value: RoutePracticeContextValue;
  children: ComponentChildren;
}) {
  return (
    <RoutePracticeContext.Provider value={value}>
      {children}
    </RoutePracticeContext.Provider>
  );
}
