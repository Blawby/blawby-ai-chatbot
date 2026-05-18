import type { ComponentProps, FunctionComponent, JSX } from 'preact';
import { Settings as SettingsIcon } from 'lucide-preact';
import { cn } from '@/shared/utils/cn';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { Avatar } from '@/shared/ui/profile';

export type SettingsNavIconProps = ComponentProps<typeof SettingsIcon>;

export const SettingsNavIcon: FunctionComponent<SettingsNavIconProps> = ({ className = '', ...props }) => {
  const { session } = useSessionContext();
  const userImage = session?.user?.image;
  const userName = session?.user?.name || session?.user?.email || 'User';
  const wrapperProps = props as unknown as JSX.HTMLAttributes<HTMLSpanElement>;
  const resolvedClassName = typeof className === 'string' ? className : '';

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

  return <SettingsIcon {...props} className={resolvedClassName} />;
};
