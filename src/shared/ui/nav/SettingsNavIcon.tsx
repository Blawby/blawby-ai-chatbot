import type { ComponentProps, FunctionComponent, JSX } from 'preact';
import { Cog6ToothIcon } from '@heroicons/react/24/solid';
import { cn } from '@/shared/utils/cn';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { Avatar } from '@/shared/ui/profile';

export type SettingsNavIconProps = ComponentProps<typeof Cog6ToothIcon>;

export const SettingsNavIcon: FunctionComponent<SettingsNavIconProps> = ({ className = '', ...props }) => {
  const { session } = useSessionContext();
  const userImage = session?.user?.image;
  const userName = session?.user?.name || session?.user?.email || 'User';
  const wrapperProps = props as unknown as JSX.HTMLAttributes<HTMLSpanElement>;
  const resolvedClassName = typeof className === 'string' ? className : '';

  // If user has avatar image, show it; otherwise fallback to cog icon
  if (userImage) {
    return (
      <span {...wrapperProps} className={cn('inline-flex items-center justify-center', resolvedClassName)}>
        <Avatar 
          src={userImage} 
          name={userName} 
          size="sm"
          className="h-5 w-5 flex-shrink-0"
        />
      </span>
    );
  }

  // Fallback to cog icon when no user image
  return <Cog6ToothIcon {...props} className={resolvedClassName} />;
};
