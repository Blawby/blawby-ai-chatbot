import { FunctionComponent } from 'preact';
import { Cog6ToothIcon } from '@heroicons/react/24/solid';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { Avatar } from '@/shared/ui/profile';

interface SettingsNavIconProps {
  className?: string;
}

export const SettingsNavIcon: FunctionComponent<SettingsNavIconProps> = ({ className = '' }) => {
  const { session } = useSessionContext();
  const userImage = session?.user?.image;
  const userName = session?.user?.name || session?.user?.email || 'User';

  // If user has avatar image, show it; otherwise fallback to cog icon
  if (userImage) {
    return (
      <Avatar 
        src={userImage} 
        name={userName} 
        size="sm"
        className="h-5 w-5 flex-shrink-0"
      />
    );
  }

  // Fallback to cog icon when no user image
  return <Cog6ToothIcon className={className} />;
};
