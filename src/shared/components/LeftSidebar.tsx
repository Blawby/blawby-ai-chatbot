import { useState } from 'preact/hooks';
import { SidebarContent, type SidebarNavItem } from '@/shared/ui/sidebar/organisms/SidebarContent';
import { useMobileDetection } from '@/shared/hooks/useMobileDetection';
import type { SubscriptionTier } from '@/shared/types/user';

interface LeftSidebarProps {
  navItems: SidebarNavItem[];
  onClose?: () => void;
  practiceConfig?: {
    name: string;
    profileImage: string | null;
    practiceId: string;
  };
  currentPractice?: {
    id: string;
    subscriptionTier?: SubscriptionTier;
  } | null;
}

const LeftSidebar = ({
  navItems,
  onClose,
  practiceConfig,
  currentPractice
}: LeftSidebarProps) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const isMobile = useMobileDetection();
  
  // On mobile, always show expanded (no collapse functionality)
  const shouldShowCollapsed = isCollapsed && !isMobile;

  return (
    <div className="h-full">
      <SidebarContent
        practiceConfig={practiceConfig}
        navItems={navItems}
        onClose={onClose}
        currentPractice={currentPractice}
        isCollapsed={shouldShowCollapsed}
        onToggleCollapse={() => setIsCollapsed(!isCollapsed)}
      />
    </div>
  );
};

export default LeftSidebar; 
