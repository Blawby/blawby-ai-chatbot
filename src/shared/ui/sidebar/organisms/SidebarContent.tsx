/**
 * SidebarContent - Organism Component
 * 
 * Orchestrates the sidebar content including header, navigation, and profile sections.
 * Handles the overall layout and spacing of sidebar components.
 */

import { SidebarHeader } from '../molecules/SidebarHeader';
import { NavigationList } from '../molecules/NavigationList';
import { NavigationItem } from '../molecules/NavigationItem';
import { ChatBubbleOvalLeftEllipsisIcon, RocketLaunchIcon, HomeIcon } from '@heroicons/react/24/outline';
import UserProfile from '@/shared/components/UserProfile';
import type { BusinessOnboardingStatus } from '@/shared/hooks/usePracticeManagement';
import type { ComponentChildren } from 'preact';
import type { SubscriptionTier } from '@/shared/types/user';

interface SidebarContentProps {
  practiceConfig?: {
    name: string;
    profileImage: string | null;
    practiceId: string;
  };
  currentRoute: string;
  onGoToDashboard?: () => void;
  onGoToChats?: () => void;
  onOpenOnboarding?: () => void;
  onClose?: () => void;
  showDashboardTab?: boolean;
  showChatsTab?: boolean;
  chatSidebarContent?: ComponentChildren;
  currentPractice?: {
    id: string;
    subscriptionTier?: SubscriptionTier;
  } | null;
  onboardingStatus?: BusinessOnboardingStatus;
  onboardingHasDraft?: boolean;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export const SidebarContent = ({
  practiceConfig,
  currentRoute,
  onGoToDashboard,
  onGoToChats,
  onOpenOnboarding,
  onClose,
  showDashboardTab = true,
  showChatsTab = true,
  chatSidebarContent,
  currentPractice,
  onboardingStatus,
  onboardingHasDraft = false,
  isCollapsed,
  onToggleCollapse
}: SidebarContentProps) => {
  
  const onboardingLabel = (() => {
    if (onboardingStatus === 'completed') return 'Setup (Completed)';
    if (onboardingHasDraft) return 'Setup (Resume)';
    return 'Setup';
  })();

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

            {/* Matter navigation temporarily hidden */}
            {/* <NavigationItem
              icon={<DocumentIcon />}
              label="Matter"
              isActive={currentRoute === 'matter'}
              onClick={onGoToMatter || (() => {})}
              isCollapsed={isCollapsed}
              matterStatus={matterStatus}
            /> */}

            {onboardingStatus && onboardingStatus !== 'not_required' && (
              <NavigationItem
                icon={<RocketLaunchIcon />}
                label={onboardingLabel}
                isActive={false}
                onClick={onOpenOnboarding || (() => {})}
                isCollapsed={isCollapsed}
              />
            )}
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
