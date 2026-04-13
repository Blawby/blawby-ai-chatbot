// Profile atoms
export { Avatar } from './atoms/Avatar';
export { ProfileIcon } from './atoms/ProfileIcon';

// Profile molecules
export { ProfileButton } from './molecules/ProfileButton';
export { ProfileMenuItem } from './molecules/ProfileMenuItem';
export { ProfileDropdown } from './molecules/ProfileDropdown';
export { StackedAvatars } from './molecules/StackedAvatars';
export { UserCard } from './molecules/UserCard';
export type { SelectableUser } from './molecules/UserCard';

// Profile organisms
export { UserProfileDisplay } from './organisms/UserProfileDisplay';

// Avatar utilities
export { 
 createAvatarProps, 
 createUserCardProps, 
 createStackedAvatarsData,
 getAvatarUrl,
 getDisplayName,
 type AvatarUser,
 type StackedAvatarUser
} from './utils/avatarUtils';

// Avatar render components
export { 
 renderUserAvatar,
 renderUserCard,
 renderStackedAvatars
} from './components/AvatarComponents';
