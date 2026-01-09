import { useState } from 'preact/hooks';
import { SidebarContent } from '@/shared/ui/sidebar/organisms/SidebarContent';
import { useMobileDetection } from '@/shared/hooks/useMobileDetection';
import type { BusinessOnboardingStatus } from '@/shared/hooks/usePracticeManagement';
import type { ComponentChildren } from 'preact';
import type { SubscriptionTier } from '@/shared/types/user';

interface LeftSidebarProps {
  currentRoute: string;
  onGoToDashboard?: () => void;
  onGoToChats?: () => void;
  onOpenOnboarding?: () => void;
  onClose?: () => void;
  showDashboardTab?: boolean;
  showChatsTab?: boolean;
  chatSidebarContent?: ComponentChildren;
  practiceConfig?: {
    name: string;
    profileImage: string | null;
    practiceId: string;
  };
  currentPractice?: {
    id: string;
    subscriptionTier?: SubscriptionTier;
  } | null;
  onboardingStatus?: BusinessOnboardingStatus;
  onboardingHasDraft?: boolean;
}

const LeftSidebar = ({
  currentRoute,
  onGoToDashboard,
  onGoToChats,
  onOpenOnboarding,
  onClose,
  showDashboardTab = true,
  showChatsTab = true,
  chatSidebarContent,
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
        onGoToDashboard={onGoToDashboard}
        onGoToChats={onGoToChats}
        onOpenOnboarding={onOpenOnboarding}
        onClose={onClose}
        showDashboardTab={showDashboardTab}
        showChatsTab={showChatsTab}
        chatSidebarContent={chatSidebarContent}
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
