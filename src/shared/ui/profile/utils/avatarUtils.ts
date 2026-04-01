/**
 * Avatar Utility Functions
 * 
 * Centralized utilities for creating consistent avatar representations
 * across the application. Reduces boilerplate and ensures standardization.
 */

import type { ComponentChildren } from 'preact';

export interface AvatarUser {
  id?: string;
  name: string;
  image?: string | null;
  email?: string;
}

export interface StackedAvatarUser {
  id: string;
  name: string;
  image?: string | null;
}

/**
 * Creates standardized props for Avatar component
 */
export function createAvatarProps(
  user: AvatarUser | null | undefined,
  size: 'xs' | 'sm' | 'md' | 'lg' | 'xl' = 'md',
  options?: {
    status?: 'active' | 'inactive';
    className?: string;
    bgClassName?: string;
  }
) {
  if (!user) {
    return {
      src: null,
      name: 'Unknown User',
      size,
      ...options
    };
  }

  return {
    src: user.image ?? null,
    name: user.name || user.email || 'Unknown User',
    size,
    ...options
  };
}

/**
 * Creates props for UserCard component
 */
export function createUserCardProps(
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
  return {
    name: user.name || user.email || 'Unknown User',
    image: user.image,
    secondary: options?.secondary ?? user.email,
    size: options?.size ?? 'md',
    badge: options?.badge,
    status: options?.status,
    onClick: options?.onClick,
    trailing: options?.trailing,
    className: options?.className
  };
}

/**
 * Creates data structure for StackedAvatars component
 */
export function createStackedAvatarsData(users: (AvatarUser | null | undefined)[]): StackedAvatarUser[] {
  return users
    .filter((user): user is AvatarUser => user !== null && user !== undefined)
    .map((user, index) => ({
      id: user.id ?? user.name ?? user.email ?? `unknown-${index}`,
      name: user.name,
      image: user.image
    }));
}

/**
 * Gets avatar URL from user object with fallback handling
 */
export function getAvatarUrl(user: AvatarUser | null | undefined): string | null {
  if (!user) return null;
  return user.image ?? null;
}

/**
 * Gets display name from user object with fallback handling
 */
export function getDisplayName(user: AvatarUser | null | undefined): string {
  if (!user) return 'Unknown User';
  return user.name || user.email || 'Unknown User';
}
