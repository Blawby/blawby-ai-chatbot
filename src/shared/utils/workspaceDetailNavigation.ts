import type { LayoutMode } from '@/app/MainApp';

export const shouldShowWorkspaceDetailBack = (
  layoutMode: LayoutMode,
  hasBackTarget = true
): boolean => layoutMode !== 'desktop' && hasBackTarget;
