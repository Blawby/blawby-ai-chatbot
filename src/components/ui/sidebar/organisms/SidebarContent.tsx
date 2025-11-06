/**
 * SidebarContent - Organism Component
 * 
 * Orchestrates the sidebar content including header, navigation, and profile sections.
 * Handles the overall layout and spacing of sidebar components.
 */

import { useEffect, useMemo, useRef } from 'preact/hooks';
import { SidebarHeader } from '../molecules/SidebarHeader';
import { NavigationList } from '../molecules/NavigationList';
import { NavigationItem } from '../molecules/NavigationItem';
import { ChatBubbleOvalLeftEllipsisIcon, DocumentIcon, RocketLaunchIcon } from '@heroicons/react/24/outline';
import UserProfile from '../../../UserProfile';
import { MatterStatus } from '../../../../types/matter';
import type { BusinessOnboardingStatus } from '../../../../hooks/useOrganizationManagement';
import { useMattersSidebar, MattersSidebarStatus } from '../../../../hooks/useMattersSidebar';
import { Input } from '../../input/Input';
import { Button } from '../../Button';

interface SidebarContentProps {
  organizationConfig?: {
    name: string;
    profileImage: string | null;
    organizationId: string;
  };
  currentRoute: string;
  onGoToChats?: () => void;
  onGoToMatter?: () => void;
  onOpenOnboarding?: () => void;
  onClose?: () => void;
  matterStatus?: MatterStatus;
  currentOrganization?: {
    id: string;
    subscriptionTier?: string;
  } | null;
  onboardingStatus?: BusinessOnboardingStatus;
  onboardingHasDraft?: boolean;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  selectedMatterId?: string | null;
  onSelectMatter?: (matterId: string) => void;
}

export const SidebarContent = ({
  organizationConfig,
  currentRoute,
  onGoToChats,
  onGoToMatter,
  onOpenOnboarding,
  onClose,
  matterStatus,
  currentOrganization,
  onboardingStatus,
  onboardingHasDraft = false,
  isCollapsed,
  onToggleCollapse,
  selectedMatterId,
  onSelectMatter
}: SidebarContentProps) => {
  
  const onboardingLabel = (() => {
    if (onboardingStatus === 'completed') return 'Setup (Completed)';
    if (onboardingHasDraft) return 'Setup (Resume)';
    return 'Setup';
  })();

  const organizationId = organizationConfig?.organizationId;
  const showMattersSection = Boolean(organizationId) && !isCollapsed;

  const {
    matters,
    loading: mattersLoading,
    error: mattersError,
    status: matterStatusFilter,
    setStatus: setMatterStatusFilter,
    searchTerm,
    setSearchTerm,
    hasMore: hasMoreMatters,
    loadMore: loadMoreMatters
  } = useMattersSidebar({
    organizationId,
    initialStatus: 'lead',
    pageSize: 20,
    autoFetch: showMattersSection
  });

  const hasInitialSelection = useRef(false);

  // Reset initial selection state when organization changes
  useEffect(() => {
    hasInitialSelection.current = false;
  }, [organizationId]);

  useEffect(() => {
    if (!showMattersSection || !onSelectMatter || matters.length === 0) {
      return;
    }

    // Respect upstream selection; only auto-select if none is provided
    if (selectedMatterId) {
      hasInitialSelection.current = true;
      return;
    }

    // Only auto-select on initial load, not on filter changes
    if (!hasInitialSelection.current) {
      onSelectMatter(matters[0].id);
      hasInitialSelection.current = true;
    }
  }, [matters, onSelectMatter, showMattersSection, selectedMatterId, organizationId]);

  const statusFilters = useMemo(() => ([
    { value: 'lead', label: 'Leads' },
    { value: 'open', label: 'Open' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'completed', label: 'Completed' },
    { value: 'archived', label: 'Archived' }
  ] satisfies Array<{ value: MattersSidebarStatus; label: string }>), []);

  const searchPlaceholder = useMemo(() => {
    const selectedFilter = statusFilters.find(f => f.value === matterStatusFilter);
    const label = selectedFilter?.label.toLowerCase() || 'matters';
    return `Search ${label}`;
  }, [statusFilters, matterStatusFilter]);


  const handleMatterSelect = (matterId: string) => {
    if (onSelectMatter) {
      onSelectMatter(matterId);
    }
  };

  return (
    <div className={`flex flex-col h-full bg-light-card-bg dark:bg-dark-card-bg transition-all duration-300 ${isCollapsed ? 'w-12' : 'w-60'}`}>
      {/* Header Section */}
      <SidebarHeader
        organizationConfig={organizationConfig}
        isCollapsed={isCollapsed}
        onToggleCollapse={onToggleCollapse}
        onClose={onClose}
      />

      {/* Matters + Navigation Section */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {showMattersSection && (
          <div className="px-2 pt-2">
            <Input
              value={searchTerm}
              onInput={(event) => {
                const target = event.target as HTMLInputElement;
                setSearchTerm(target.value);
              }}
              placeholder={searchPlaceholder}
              label=""
              hideLabel
            />
          </div>
        )}

        {showMattersSection && (
          <div className="px-2 pt-2">
            <div className="flex gap-2 overflow-x-auto">
              {statusFilters.map(filter => {
                const isActive = matterStatusFilter === filter.value;
                return (
                  <button
                    key={filter.value}
                    type="button"
                    onClick={() => setMatterStatusFilter(filter.value)}
                    className={`whitespace-nowrap text-xs px-3 py-1 rounded-full border transition-colors ${
                      isActive
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-transparent hover:bg-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    {filter.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {showMattersSection && (
          <div className="px-2 pt-2 flex-1 overflow-y-auto">
            <div className="flex flex-col gap-1">
              {mattersLoading && matters.length === 0 && (
                <div className="text-xs text-gray-500 dark:text-gray-400 py-2">
                  Loading matters…
                </div>
              )}

              {mattersError && (
                <div className="text-xs text-red-500 dark:text-red-400 py-2">
                  {mattersError}
                </div>
              )}

              {!mattersLoading && !mattersError && matters.length === 0 && (
                <div className="text-xs text-gray-500 dark:text-gray-400 py-2">
                  No matters found for this filter.
                </div>
              )}

              {matters.map(matter => {
                const isSelected = matter.id === selectedMatterId;
                const displayLabel = matter.clientName?.trim().length ? matter.clientName : matter.title;
                return (
                  <button
                    key={matter.id}
                    type="button"
                    onClick={() => handleMatterSelect(matter.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg transition-colors border ${
                      isSelected
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 border-transparent hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                  >
                    <div className="text-sm font-medium truncate">{displayLabel}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {matter.matterType}
                    </div>
                  </button>
                );
              })}

              {hasMoreMatters && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => loadMoreMatters()}
                  disabled={mattersLoading}
                  className="mt-2"
                >
                  Load more
                </Button>
              )}
            </div>
          </div>
        )}

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
        currentOrganization={currentOrganization} 
      />
    </div>
  );
};
