import type { ComponentChildren, FunctionComponent } from 'preact';

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

interface WorkspaceSectionContentProps {
  view: WorkspaceView;
  setupContent: ComponentChildren;
  homeContent: ComponentChildren;
  listContent: ComponentChildren;
  mattersContent: ComponentChildren;
  clientsContent: ComponentChildren;
  invoicesContent: ComponentChildren;
  reportsContent: ComponentChildren;
  settingsContent: ComponentChildren;
  chatContent: ComponentChildren;
}

export const WorkspaceSectionContent: FunctionComponent<WorkspaceSectionContentProps> = ({
  view,
  setupContent,
  homeContent,
  listContent,
  mattersContent,
  clientsContent,
  invoicesContent,
  reportsContent,
  settingsContent,
  chatContent,
}) => {
  switch (view) {
    case 'setup':
      return <>{setupContent}</>;
    case 'home':
      return <>{homeContent}</>;
    case 'list':
      return <>{listContent}</>;
    case 'matters':
      return <>{mattersContent}</>;
    case 'clients':
      return <>{clientsContent}</>;
    case 'invoices':
    case 'invoiceDetail':
      return <>{invoicesContent}</>;
    case 'reports':
      return <>{reportsContent}</>;
    case 'settings':
      return <>{settingsContent}</>;
    case 'conversation':
    default:
      return <>{chatContent}</>;
  }
};
