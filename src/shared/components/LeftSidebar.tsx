import { useState } from 'preact/hooks';
import { SidebarContent } from '@/shared/ui/sidebar/organisms/SidebarContent';
import { useMobileDetection } from '@/shared/hooks/useMobileDetection';
import type { BusinessOnboardingStatus } from '@/shared/hooks/usePracticeManagement';

interface LeftSidebarProps {
  currentRoute: string;
  onGoToChats?: () => void;
  onGoToInbox?: () => void;
  onOpenOnboarding?: () => void;
  onClose?: () => void;
  showChatsTab?: boolean;
  showInboxTab?: boolean;
  practiceConfig?: {
    name: string;
    profileImage: string | null;
    practiceId: string;
  };
  currentPractice?: {
    id: string;
    subscriptionTier?: string;
  } | null;
  onboardingStatus?: BusinessOnboardingStatus;
  onboardingHasDraft?: boolean;
}

const LeftSidebar = ({
  currentRoute,
  onGoToChats,
  onGoToInbox,
  onOpenOnboarding,
  onClose,
  showChatsTab = true,
  showInboxTab = true,
  practiceConfig,
  currentPractice,
  onboardingStatus,
  onboardingHasDraft
}: LeftSidebarProps) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const isMobile = useMobileDetection();
  
  // On mobile, always show expanded (no collapse functionality)
  const shouldShowCollapsed = isCollapsed && !isMobile;

  return (
    <div className="h-full">
      <SidebarContent
        practiceConfig={practiceConfig}
        currentRoute={currentRoute}
        onGoToChats={onGoToChats}
        onGoToInbox={onGoToInbox}
        onOpenOnboarding={onOpenOnboarding}
        onClose={onClose}
        showChatsTab={showChatsTab}
        showInboxTab={showInboxTab}
        currentPractice={currentPractice}
        onboardingStatus={onboardingStatus}
        onboardingHasDraft={onboardingHasDraft}
        isCollapsed={shouldShowCollapsed}
        onToggleCollapse={() => setIsCollapsed(!isCollapsed)}
      />
    </div>
  );
};

export default LeftSidebar; 
