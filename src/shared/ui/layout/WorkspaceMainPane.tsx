import type { ComponentChildren } from 'preact';
import type { LayoutMode } from '@/app/MainApp';
import { cn } from '@/shared/utils/cn';

type WorkspaceView =
  | 'home'
  | 'setup'
  | 'list'
  | 'conversation'
  | 'matters'
  | 'clients'
  | 'invoices'
  | 'invoiceDetail'
  | 'reports'
  | 'settings';

type WorkspaceMainPaneProps = {
  layoutMode: LayoutMode;
  view: WorkspaceView;
  isPracticeWorkspace: boolean;
  isClientWorkspace: boolean;
  selectedMatterIdFromPath: string | null;
  isMatterNonListRoute: boolean;
  chatView: ComponentChildren;
  content: ComponentChildren;
  topBar?: ComponentChildren;
  bottomNav?: ComponentChildren;
};

const SectionPlaceholder = ({
  title,
  description,
}: {
  title: string;
  description: string;
}) => (
  <div className="h-full flex items-center justify-center">
    <div className="text-center">
      <h3 className="text-sm font-semibold text-input-text">{title}</h3>
      <p className="mt-2 text-sm text-input-placeholder">{description}</p>
    </div>
  </div>
);

export function WorkspaceMainPane({
  layoutMode,
  view,
  isPracticeWorkspace,
  isClientWorkspace,
  selectedMatterIdFromPath,
  isMatterNonListRoute,
  chatView,
  content,
  topBar,
  bottomNav,
}: WorkspaceMainPaneProps) {
  const isDesktop = layoutMode === 'desktop';
  const isDesktopWorkspace = isPracticeWorkspace || isClientWorkspace;
  const isDesktopConversationShell = isDesktop && isDesktopWorkspace && (view === 'list' || view === 'conversation');
  const isDesktopMattersShell = isDesktop && isDesktopWorkspace && view === 'matters';
  const isDesktopClientsShell = isDesktop && isPracticeWorkspace && view === 'clients';
  const isDesktopReportsShell = isDesktop && isPracticeWorkspace && view === 'reports';
  const isDesktopInvoicesShell = isDesktop && isDesktopWorkspace && (view === 'invoices' || view === 'invoiceDetail');
  const shouldAllowMainScroll = view !== 'conversation' && view !== 'list';
  const isMatterDetailRoute = Boolean(selectedMatterIdFromPath);

  const mainContent = isDesktopConversationShell
    ? (
      <div className="min-h-0 h-full flex flex-1 flex-col overflow-hidden">
        {chatView}
      </div>
    )
    : isDesktopMattersShell
      ? (selectedMatterIdFromPath || isMatterNonListRoute)
        ? (
          <div className={cn(
            'min-h-0 h-full flex flex-1 flex-col',
            isMatterDetailRoute ? 'overflow-hidden' : 'overflow-y-auto'
          )}>
            {content}
          </div>
        )
        : (
          <SectionPlaceholder
            title="Select a matter"
            description="Choose a matter from the list to view its details."
          />
        )
      : isDesktopClientsShell || isDesktopReportsShell
        ? (
          <div className="min-h-0 h-full flex flex-1 flex-col overflow-hidden">
            {content}
          </div>
        )
      : isDesktopInvoicesShell
        ? view === 'invoiceDetail'
          ? (
            <div className="min-h-0 h-full flex flex-1 flex-col overflow-hidden">
              {content}
            </div>
          )
          : (
            <SectionPlaceholder
              title="Select an invoice"
              description="Choose an invoice from the list to view details."
            />
          )
      : (
        <div className={cn('min-h-0 h-full flex flex-1 flex-col', shouldAllowMainScroll ? 'overflow-y-auto' : 'overflow-hidden')}>
          {content}
        </div>
      );

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col">
      {topBar ? <div>{topBar}</div> : null}
      <div className="relative h-full min-h-0">
        {mainContent}
      </div>
      {bottomNav ? <div className="mt-auto">{bottomNav}</div> : null}
    </div>
  );
}
