/**
 * SidebarContent - Organism Component
 * 
 * Orchestrates the sidebar content including header, navigation, and profile sections.
 * Handles the overall layout and spacing of sidebar components.
 */

import { SidebarHeader } from '../molecules/SidebarHeader';
import { NavigationList } from '../molecules/NavigationList';
import { NavigationItem } from '../molecules/NavigationItem';
import { ChatBubbleOvalLeftEllipsisIcon, HomeIcon, ChatBubbleLeftRightIcon, ShieldCheckIcon, CreditCardIcon, ClipboardDocumentCheckIcon, DocumentTextIcon, InboxIcon } from '@heroicons/react/24/outline';
import UserProfile from '@/shared/components/UserProfile';
import type { ComponentChildren } from 'preact';
import type { SubscriptionTier } from '@/shared/types/user';
import { useNotificationCounts } from '@/features/notifications/hooks/useNotificationCounts';
import type { NotificationCategory } from '@/features/notifications/types';

interface SidebarContentProps {
  practiceConfig?: {
    name: string;
    profileImage: string | null;
    practiceId: string;
  };
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
  currentPractice?: {
    id: string;
    subscriptionTier?: SubscriptionTier;
  } | null;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export const SidebarContent = ({
  practiceConfig,
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
  currentPractice,
  isCollapsed,
  onToggleCollapse
}: SidebarContentProps) => {
  const { unreadByCategory } = useNotificationCounts();
  const isNotificationsActive = currentRoute === 'notifications';

  const notificationTabs: Array<{ key: NotificationCategory; label: string; icon: ComponentChildren }> = [
    { key: 'message', label: 'Messages', icon: <ChatBubbleLeftRightIcon /> },
    { key: 'system', label: 'System', icon: <ShieldCheckIcon /> },
    { key: 'payment', label: 'Payments', icon: <CreditCardIcon /> },
    { key: 'intake', label: 'Intakes', icon: <ClipboardDocumentCheckIcon /> },
    { key: 'matter', label: 'Matters', icon: <DocumentTextIcon /> }
  ];

  return (
    <div className={`flex flex-col h-full bg-light-card-bg dark:bg-dark-card-bg transition-all duration-300 ${isCollapsed ? 'w-12' : 'w-60'}`}>
      {/* Header Section */}
      <SidebarHeader
        practiceConfig={practiceConfig}
        isCollapsed={isCollapsed}
        onToggleCollapse={onToggleCollapse}
        onClose={onClose}
      />

      {/* Navigation Section */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="p-2">
          <NavigationList>
            {showDashboardTab && onGoToDashboard && (
              <NavigationItem
                icon={<HomeIcon />}
                label="Dashboard"
                isActive={currentRoute === 'dashboard'}
                onClick={onGoToDashboard}
                isCollapsed={isCollapsed}
              />
            )}

            {showChatsTab && onGoToChats && (
              <NavigationItem
                icon={<ChatBubbleOvalLeftEllipsisIcon />}
                label="Chats"
                isActive={currentRoute === 'chats'}
                onClick={onGoToChats}
                isCollapsed={isCollapsed}
              />
            )}

            {showLeadsTab && onGoToLeads && (
              <NavigationItem
                icon={<InboxIcon />}
                label="Leads"
                isActive={currentRoute === 'leads'}
                onClick={onGoToLeads}
                isCollapsed={isCollapsed}
              />
            )}

            {/* Matter navigation temporarily hidden */}
            {/* <NavigationItem
              icon={<DocumentIcon />}
              label="Matter"
              isActive={currentRoute === 'matter'}
              onClick={onGoToMatter || (() => {})}
              isCollapsed={isCollapsed}
              matterStatus={matterStatus}
            /> */}

          </NavigationList>
        </div>

        <div className="px-3 pt-2">
          {!isCollapsed && (
            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
              Notifications
            </div>
          )}
          <NavigationList className="mt-2">
            {notificationTabs.map((tab) => (
              <NavigationItem
                key={tab.key}
                icon={tab.icon}
                label={tab.label}
                isActive={isNotificationsActive && notificationCategory === tab.key}
                onClick={() => onSelectNotificationCategory?.(tab.key)}
                isCollapsed={isCollapsed}
                hasUnread={unreadByCategory[tab.key] > 0}
                showUnreadDot={unreadByCategory[tab.key] > 0}
              />
            ))}
          </NavigationList>
        </div>

        {!isCollapsed && currentRoute === 'chats' && chatSidebarContent && (
          <div className="flex-1 overflow-y-auto px-1 pb-2">
            {chatSidebarContent}
          </div>
        )}
      </div>

      {/* User Profile Section */}
      <UserProfile 
        isCollapsed={isCollapsed} 
        currentPractice={currentPractice} 
      />
    </div>
  );
};
