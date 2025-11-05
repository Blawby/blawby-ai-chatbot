import { useState } from 'preact/hooks';
import { MatterStatus } from '../types/matter';
import { SidebarContent } from './ui/sidebar/organisms/SidebarContent';
import { useMobileDetection } from '../hooks/useMobileDetection';

interface LeftSidebarProps {
  currentRoute: string;
  onGoToChats?: () => void;
  onGoToMatter?: () => void;
  onOpenOnboarding?: () => void;
  onClose?: () => void;
  matterStatus?: MatterStatus;
  organizationConfig?: {
    name: string;
    profileImage: string | null;
    organizationId: string;
  };
  currentOrganization?: {
    id: string;
    subscriptionTier?: string;
  } | null;
}

const LeftSidebar = ({ currentRoute, onGoToChats, onGoToMatter, onOpenOnboarding, onClose, matterStatus, organizationConfig, currentOrganization }: LeftSidebarProps) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const isMobile = useMobileDetection();
  
  // On mobile, always show expanded (no collapse functionality)
  const shouldShowCollapsed = isCollapsed && !isMobile;

  return (
    <div className="h-full">
      <SidebarContent
        organizationConfig={organizationConfig}
        currentRoute={currentRoute}
        onGoToChats={onGoToChats}
        onGoToMatter={onGoToMatter}
        onOpenOnboarding={onOpenOnboarding}
        onClose={onClose}
        matterStatus={matterStatus}
        currentOrganization={currentOrganization}
        isCollapsed={shouldShowCollapsed}
        onToggleCollapse={() => setIsCollapsed(!isCollapsed)}
      />
    </div>
  );
};

export default LeftSidebar; 