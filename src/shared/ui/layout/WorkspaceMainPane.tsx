import type { ComponentChildren } from 'preact';
import type { LayoutMode } from '@/app/MainApp';
import { WorkspacePlaceholderState, type WorkspacePlaceholderAction } from '@/shared/ui/layout/WorkspacePlaceholderState';
import { cn } from '@/shared/utils/cn';
import { useTranslation } from '@/shared/i18n/hooks';

type WorkspaceView =
  | 'home'
  | 'setup'
  | 'list'
  | 'conversation'
  | 'matters'
  | 'clients'
  | 'invoices'
  | 'invoiceCreate'
  | 'invoiceDetail'
  | 'reports'
  | 'settings';

export type WorkspaceSectionPlaceholder = {
  titleKey: string;
  descriptionKey: string;
  emptyTitleKey?: string;
  emptyDescriptionKey?: string;
  action?: WorkspacePlaceholderAction;
  isEmpty?: boolean;
};

export type WorkspaceMainPaneLayout =
  | { kind: 'conversation-shell' }
  | { kind: 'full-page'; overflow?: 'auto' | 'hidden' }
  | { kind: 'split-detail'; hasSelection: boolean; overflow?: 'auto' | 'hidden'; placeholder: WorkspaceSectionPlaceholder };

type WorkspaceMainPaneProps = {
  layoutMode: LayoutMode;
  view: WorkspaceView;
  content: ComponentChildren;
  chatView: ComponentChildren;
  layout: WorkspaceMainPaneLayout;
  topBar?: ComponentChildren;
  bottomNav?: ComponentChildren;
};

const SectionPlaceholder = ({ placeholder }: { placeholder: WorkspaceSectionPlaceholder }) => {
  const { t } = useTranslation();
  return (
    <WorkspacePlaceholderState
      title={t(placeholder.isEmpty && placeholder.emptyTitleKey ? placeholder.emptyTitleKey : placeholder.titleKey)}
      description={t(placeholder.isEmpty && placeholder.emptyDescriptionKey ? placeholder.emptyDescriptionKey : placeholder.descriptionKey)}
      primaryAction={placeholder.action}
      className="p-8"
    />
  );
};

export function WorkspaceMainPane({
  layoutMode,
  view,
  content,
  chatView,
  layout,
  topBar,
  bottomNav,
}: WorkspaceMainPaneProps) {
  const isDesktop = layoutMode === 'desktop';
  const shouldAllowMainScroll = view !== 'conversation' && view !== 'list';

  const resolveOverflowClass = (overflow?: 'auto' | 'hidden') =>
    overflow === 'auto' ? 'overflow-y-auto' : 'overflow-hidden';

  const mainContent = layout.kind === 'conversation-shell' && isDesktop
    ? (
      <div className="min-h-0 h-full flex flex-1 flex-col overflow-hidden">
        {chatView}
      </div>
    )
    : layout.kind === 'split-detail' && isDesktop
      ? layout.hasSelection
        ? (
          <div className={cn('min-h-0 h-full flex flex-1 flex-col', resolveOverflowClass(layout.overflow))}>
            {content}
          </div>
        )
        : <SectionPlaceholder placeholder={layout.placeholder} />
      : layout.kind === 'full-page' && isDesktop
        ? (
          <div className={cn('min-h-0 h-full flex flex-1 flex-col', resolveOverflowClass(layout.overflow))}>
            {content}
          </div>
        )
      : (
        <div className={cn('min-h-0 h-full flex flex-1 flex-col', shouldAllowMainScroll ? 'overflow-y-auto' : 'overflow-hidden')}>
          {content}
        </div>
      );

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col">
      {topBar ? <div>{topBar}</div> : null}
      <div className="relative flex-1 min-h-0">
        {mainContent}
      </div>
      {bottomNav ? <div className="mt-auto">{bottomNav}</div> : null}
    </div>
  );
}
