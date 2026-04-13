/**
 * Avatar Render Components
 * 
 * JSX components that use the avatar utility functions.
 * Separated from utils to avoid JSX in .ts files.
 */

import { Avatar } from '../atoms/Avatar';
import { UserCard } from '../molecules/UserCard';
import { StackedAvatars } from '../molecules/StackedAvatars';
import { 
 createAvatarProps, 
 createUserCardProps, 
 createStackedAvatarsData,
 type AvatarUser 
} from '../utils/avatarUtils';
import type { ComponentChildren } from 'preact';

/**
 * Convenience wrapper for rendering user avatars
 */
export function renderUserAvatar(
 user: AvatarUser | null | undefined,
 size: 'xs' | 'sm' | 'md' | 'lg' | 'xl' = 'xs',
 className?: string
) {
 const props = createAvatarProps(user, size, { className });
 return <Avatar {...props} />;
}

/**
 * Renders a UserCard for a user
 */
export function renderUserCard(
 user: AvatarUser,
 options?: {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  badge?: string;
  status?: 'active' | 'inactive';
  secondary?: string;
  onClick?: () => void;
  trailing?: ComponentChildren;
  className?: string;
 }
) {
 const props = createUserCardProps(user, options);
 return <UserCard {...props} />;
}

/**
 * Renders stacked avatars for multiple users
 */
export function renderStackedAvatars(
 users: (AvatarUser | null | undefined)[],
 options?: {
  size?: 'sm' | 'md' | 'lg';
  max?: number;
  showOverflow?: boolean;
  className?: string;
 }
) {
 const stackedData = createStackedAvatarsData(users);
 return (
  <StackedAvatars
   users={stackedData}
   size={options?.size ?? 'sm'}
   max={options?.max ?? 4}
   showOverflow={options?.showOverflow ?? true}
   className={options?.className}
  />
 );
}
