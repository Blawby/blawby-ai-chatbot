import { UserProfileDisplay } from '@/shared/ui/profile/organisms/UserProfileDisplay';


interface UserProfileProps {
  isCollapsed?: boolean;
  isMobile?: boolean;
  currentPractice?: {
    id: string;
    kind?: 'personal' | 'business' | 'practice';
    subscriptionStatus?: 'none' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete' | 'incomplete_expired' | 'unpaid' | 'paused';
    isPersonal?: boolean | null;
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
