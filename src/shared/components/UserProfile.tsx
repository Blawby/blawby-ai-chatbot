import { UserProfileDisplay } from '@/shared/ui/profile/organisms/UserProfileDisplay';
import type { SubscriptionTier } from '@/shared/types/user';


interface UserProfileProps {
  isCollapsed?: boolean;
  isMobile?: boolean;
  currentPractice?: {
    id: string;
    subscriptionTier?: SubscriptionTier;
  } | null;
}

const UserProfile = ({ isCollapsed = false, currentPractice }: UserProfileProps) => {
  return (
    <UserProfileDisplay 
      isCollapsed={isCollapsed} 
      currentPractice={currentPractice} 
    />
  );
};

export default UserProfile;
