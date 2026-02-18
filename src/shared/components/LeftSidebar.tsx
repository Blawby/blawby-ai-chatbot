import { useState } from 'preact/hooks';
import { SidebarContent, type SidebarNavItem } from '@/shared/ui/sidebar/organisms/SidebarContent';
import { useMobileDetection } from '@/shared/hooks/useMobileDetection';

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
    kind?: 'personal' | 'business' | 'practice';
    subscriptionStatus?: 'none' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete' | 'incomplete_expired' | 'unpaid' | 'paused';
    isPersonal?: boolean | null;
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
