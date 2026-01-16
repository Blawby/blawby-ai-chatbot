import { useState } from 'preact/hooks';
import { SidebarContent } from '@/shared/ui/sidebar/organisms/SidebarContent';
import { useMobileDetection } from '@/shared/hooks/useMobileDetection';
import type { ComponentChildren } from 'preact';
import type { SubscriptionTier } from '@/shared/types/user';
import type { NotificationCategory } from '@/features/notifications/types';

interface LeftSidebarProps {
  currentRoute: string;
  onGoToDashboard?: () => void;
  onGoToChats?: () => void;
  onGoToLeads?: () => void;
  onSelectNotificationCategory?: (category: NotificationCategory) => void;
  onClose?: () => void;
  showDashboardTab?: boolean;
  showChatsTab?: boolean;
  showLeadsTab?: boolean;
  notificationCategory?: NotificationCategory;
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
}

const LeftSidebar = ({
  currentRoute,
  onGoToDashboard,
  onGoToChats,
  onGoToLeads,
  onSelectNotificationCategory,
  onClose,
  showDashboardTab = true,
  showChatsTab = true,
  showLeadsTab = false,
  notificationCategory = 'message',
  chatSidebarContent,
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
        currentRoute={currentRoute}
        onGoToDashboard={onGoToDashboard}
        onGoToChats={onGoToChats}
        onGoToLeads={onGoToLeads}
        onSelectNotificationCategory={onSelectNotificationCategory}
        onClose={onClose}
        showDashboardTab={showDashboardTab}
        showChatsTab={showChatsTab}
        showLeadsTab={showLeadsTab}
        notificationCategory={notificationCategory}
        chatSidebarContent={chatSidebarContent}
        currentPractice={currentPractice}
        isCollapsed={shouldShowCollapsed}
        onToggleCollapse={() => setIsCollapsed(!isCollapsed)}
      />
    </div>
  );
};

export default LeftSidebar; 
