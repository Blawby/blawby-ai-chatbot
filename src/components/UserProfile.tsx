import { UserProfileDisplay } from './ui/profile/organisms/UserProfileDisplay';


interface UserProfileProps {
  isCollapsed?: boolean;
  isMobile?: boolean;
  currentOrganization?: {
    id: string;
    subscriptionTier?: string;
  } | null;
}

const UserProfile = ({ isCollapsed = false, currentOrganization }: UserProfileProps) => {
  return (
    <UserProfileDisplay 
      isCollapsed={isCollapsed} 
      currentOrganization={currentOrganization} 
    />
  );
};

export default UserProfile;
