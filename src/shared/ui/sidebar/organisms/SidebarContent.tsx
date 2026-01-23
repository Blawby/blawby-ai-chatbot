/**
 * SidebarContent - Organism Component
 * 
 * Orchestrates the sidebar content including header, navigation, and profile sections.
 * Handles the overall layout and spacing of sidebar components.
 */

import { SidebarHeader } from '../molecules/SidebarHeader';
import { NavigationList } from '../molecules/NavigationList';
import { NavigationItem } from '../molecules/NavigationItem';
import UserProfile from '@/shared/components/UserProfile';
import type { ComponentChildren } from 'preact';
import type { SubscriptionTier } from '@/shared/types/user';
import type { MatterStatus } from '@/shared/types/matter';

export interface SidebarNavItem {
  id: string;
  label: string;
  icon: ComponentChildren;
  isActive: boolean;
  onClick: () => void;
  matterStatus?: MatterStatus;
  hasUnread?: boolean;
  showUnreadDot?: boolean;
}

interface SidebarContentProps {
  practiceConfig?: {
    name: string;
    profileImage: string | null;
    practiceId: string;
  };
  navItems: SidebarNavItem[];
  onClose?: () => void;
  conversationContent?: ComponentChildren;
  currentPractice?: {
    id: string;
    subscriptionTier?: SubscriptionTier;
  } | null;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export const SidebarContent = ({
  practiceConfig,
  navItems,
  onClose,
  conversationContent,
  currentPractice,
  isCollapsed,
  onToggleCollapse
}: SidebarContentProps) => {

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
            {navItems.map((item) => (
              <NavigationItem
                key={item.id}
                icon={item.icon}
                label={item.label}
                isActive={item.isActive}
                onClick={item.onClick}
                isCollapsed={isCollapsed}
                matterStatus={item.matterStatus}
                hasUnread={item.hasUnread}
                showUnreadDot={item.showUnreadDot}
              />
            ))}
          </NavigationList>
        </div>

        {!isCollapsed && conversationContent && (
          <div className="mt-auto flex-1 overflow-y-auto border-t border-gray-200 dark:border-dark-border px-1 pb-2">
            {conversationContent}
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
