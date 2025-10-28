/**
 * SidebarContent - Organism Component
 * 
 * Orchestrates the sidebar content including header, navigation, and profile sections.
 * Handles the overall layout and spacing of sidebar components.
 */

import { SidebarHeader } from '../molecules/SidebarHeader';
import { NavigationList } from '../molecules/NavigationList';
import { NavigationItem } from '../molecules/NavigationItem';
import { ChatBubbleOvalLeftEllipsisIcon, DocumentIcon } from '@heroicons/react/24/outline';
import UserProfile from '../../../UserProfile';
import { MatterStatus } from '../../../../types/matter';

interface SidebarContentProps {
  organizationConfig?: {
    name: string;
    profileImage: string | null;
    organizationId: string;
  };
  currentRoute: string;
  onGoToChats?: () => void;
  onGoToMatter?: () => void;
  onClose?: () => void;
  matterStatus?: MatterStatus;
  currentOrganization?: {
    id: string;
    subscriptionTier?: string;
  } | null;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export const SidebarContent = ({
  organizationConfig,
  currentRoute,
  onGoToChats,
  onGoToMatter,
  onClose,
  matterStatus,
  currentOrganization,
  isCollapsed,
  onToggleCollapse
}: SidebarContentProps) => {
  return (
    <div className={`flex flex-col h-full bg-light-card-bg dark:bg-dark-card-bg transition-all duration-300 ${isCollapsed ? 'w-12' : 'w-60'}`}>
      {/* Header Section */}
      <SidebarHeader
        organizationConfig={organizationConfig}
        isCollapsed={isCollapsed}
        onToggleCollapse={onToggleCollapse}
        onClose={onClose}
      />

      {/* Navigation Section */}
      <div className="flex-1 p-2">
        <NavigationList>
          {/* Chats Navigation */}
          <NavigationItem
            icon={<ChatBubbleOvalLeftEllipsisIcon />}
            label="Chats"
            isActive={currentRoute === 'chats'}
            onClick={onGoToChats || (() => {})}
            isCollapsed={isCollapsed}
          />

          {/* Matter Navigation */}
          <NavigationItem
            icon={<DocumentIcon />}
            label="Matter"
            isActive={currentRoute === 'matter'}
            onClick={onGoToMatter || (() => {})}
            isCollapsed={isCollapsed}
            matterStatus={matterStatus}
          />
        </NavigationList>
      </div>

      {/* User Profile Section */}
      <UserProfile 
        isCollapsed={isCollapsed} 
        currentOrganization={currentOrganization} 
      />
    </div>
  );
};
