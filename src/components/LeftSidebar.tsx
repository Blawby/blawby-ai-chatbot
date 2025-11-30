import { useState } from 'preact/hooks';
import { MatterStatus } from '../types/matter';
import { SidebarContent } from './ui/sidebar/organisms/SidebarContent';
import { useMobileDetection } from '../hooks/useMobileDetection';
import type { BusinessOnboardingStatus } from '../hooks/usePracticeManagement';

interface LeftSidebarProps {
  currentRoute: string;
  onGoToChats?: () => void;
  onGoToMatter?: () => void;
  onOpenOnboarding?: () => void;
  onClose?: () => void;
  matterStatus?: MatterStatus;
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
  selectedMatterId?: string | null;
  onSelectMatter?: (matterId: string) => void;
}

const LeftSidebar = ({ currentRoute, onGoToChats, onGoToMatter, onOpenOnboarding, onClose, matterStatus, practiceConfig, currentPractice, onboardingStatus, onboardingHasDraft, selectedMatterId, onSelectMatter }: LeftSidebarProps) => {
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
        onGoToMatter={onGoToMatter}
        onOpenOnboarding={onOpenOnboarding}
        onClose={onClose}
        matterStatus={matterStatus}
        currentPractice={currentPractice}
        onboardingStatus={onboardingStatus}
        onboardingHasDraft={onboardingHasDraft}
        isCollapsed={shouldShowCollapsed}
        onToggleCollapse={() => setIsCollapsed(!isCollapsed)}
        selectedMatterId={selectedMatterId}
        onSelectMatter={onSelectMatter}
      />
    </div>
  );
};

export default LeftSidebar; 
