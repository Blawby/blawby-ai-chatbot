import { UserProfileDisplay } from '@/shared/ui/profile/organisms/UserProfileDisplay';


interface UserProfileProps {
  isCollapsed?: boolean;
  isMobile?: boolean;
  currentPractice?: {
    id: string;
    subscriptionTier?: string;
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
