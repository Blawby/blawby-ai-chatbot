/**
 * SidebarContent - Organism Component
 * 
 * Orchestrates the sidebar content including header, navigation, and profile sections.
 * Handles the overall layout and spacing of sidebar components.
 */

import { SidebarHeader } from '../molecules/SidebarHeader';
import { NavigationList } from '../molecules/NavigationList';
import { NavigationItem } from '../molecules/NavigationItem';
import { ChatBubbleOvalLeftEllipsisIcon, DocumentIcon, RocketLaunchIcon } from '@heroicons/react/24/outline';
import UserProfile from '../../../UserProfile';
import { MatterStatus } from '../../../../types/matter';
import type { BusinessOnboardingStatus } from '../../../../hooks/usePracticeManagement';

interface SidebarContentProps {
  practiceConfig?: {
    name: string;
    profileImage: string | null;
    practiceId: string;
  };
  currentRoute: string;
  onGoToChats?: () => void;
  onGoToMatter?: () => void;
  onOpenOnboarding?: () => void;
  onClose?: () => void;
  matterStatus?: MatterStatus;
  currentPractice?: {
    id: string;
    subscriptionTier?: string;
  } | null;
  onboardingStatus?: BusinessOnboardingStatus;
  onboardingHasDraft?: boolean;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export const SidebarContent = ({
  practiceConfig,
  currentRoute,
  onGoToChats,
  onGoToMatter,
  onOpenOnboarding,
  onClose,
  matterStatus,
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
            <NavigationItem
              icon={<ChatBubbleOvalLeftEllipsisIcon />}
              label="Chats"
              isActive={currentRoute === 'chats'}
              onClick={onGoToChats || (() => {})}
              isCollapsed={isCollapsed}
            />

            <NavigationItem
              icon={<DocumentIcon />}
              label="Matter"
              isActive={currentRoute === 'matter'}
              onClick={onGoToMatter || (() => {})}
              isCollapsed={isCollapsed}
              matterStatus={matterStatus}
            />

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
      </div>

      {/* User Profile Section */}
      <UserProfile 
        isCollapsed={isCollapsed} 
        currentPractice={currentPractice} 
      />
    </div>
  );
};
