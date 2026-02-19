import { UserProfileDisplay } from '@/shared/ui/profile/organisms/UserProfileDisplay';


interface UserProfileProps {
  isCollapsed?: boolean;
  isMobile?: boolean;
}

const UserProfile = ({ isCollapsed = false }: UserProfileProps) => {
  return (
    <UserProfileDisplay 
      isCollapsed={isCollapsed}
    />
  );
};

export default UserProfile;
