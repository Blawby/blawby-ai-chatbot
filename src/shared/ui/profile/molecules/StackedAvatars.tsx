import { Avatar } from '../atoms/Avatar';
import { cn } from '@/shared/utils/cn';

interface StackedAvatarUser {
  name: string;
  image?: string | null;
}

interface StackedAvatarsProps {
  users: StackedAvatarUser[];
  size?: 'sm' | 'md' | 'lg';
  max?: number;
  className?: string;
  showOverflow?: boolean;
}

const sizeConfig = {
  sm: {
    avatar: 'sm',
    overlap: '-space-x-1',
    badge: 'w-6 h-6 text-[10px]'
  },
  md: {
    avatar: 'md',
    overlap: '-space-x-2',
    badge: 'w-9 h-9 text-xs'
  },
  lg: {
    avatar: 'lg',
    overlap: '-space-x-2',
    badge: 'w-10 h-10 text-xs'
  }
} as const;

const ringClasses =
  'ring-2 ring-white outline -outline-offset-1 outline-black/5 dark:ring-gray-900 dark:outline-white/10';

export const StackedAvatars = ({
  users,
  size = 'sm',
  max = 4,
  className = '',
  showOverflow = true
}: StackedAvatarsProps) => {
  const config = sizeConfig[size];
  const visibleUsers = users.slice(0, max);
  const overflowCount = Math.max(users.length - visibleUsers.length, 0);

  if (visibleUsers.length === 0 && !showOverflow) {
    return null;
  }

  return (
    <div className={cn('flex overflow-hidden', config.overlap, className)}>
      {visibleUsers.map((user, index) => (
        <Avatar
          key={`${user.name}-${index}`}
          src={user.image}
          name={user.name}
          size={config.avatar}
          className={ringClasses}
        />
      ))}
      {showOverflow && overflowCount > 0 && (
        <div
          className={cn(
            'rounded-full bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-semibold flex items-center justify-center',
            ringClasses,
            config.badge
          )}
        >
          {`+${overflowCount}`}
        </div>
      )}
    </div>
  );
};
