/**
 * Avatar - Atom Component
 * Pure user avatar display with image/initials fallback.
 */

import { useState, useEffect } from 'preact/hooks';
import { UserIcon } from '@heroicons/react/24/outline';
import { Icon } from '@/shared/ui/Icon';
import { sanitizeUserImageUrl } from '@/shared/utils/urlValidation';

interface AvatarProps {
  src?: string | null;
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  /** Override the inner circle background. Defaults to 'glass-input'.
   *  Pass a solid Tailwind class (e.g. 'bg-surface-overlay') when
   *  rendering inside StackedAvatars to prevent backdrop-blur bleed-through.
   */
  bgClassName?: string;
  status?: 'active' | 'inactive';
}

export const Avatar = ({ src, name, size = 'md', className = '', bgClassName, status }: AvatarProps) => {
  const [hasImgError, setHasImgError] = useState(false);

  // Reset error state when src changes so new images can be attempted
  useEffect(() => {
    setHasImgError(false);
  }, [src]);

  const sizeClasses = {
    xs: 'w-4 h-4',
    sm: 'w-6 h-6',
    md: 'w-9 h-9', // 36px to match original main look
    lg: 'w-10 h-10',
    xl: 'w-36 h-36'
  } as const;

  const textSizeClasses = {
    xs: 'text-[10px]',
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
    xl: 'text-6xl'
  } as const;

  const getInitials = (fullName: string) => {
    // Handle edge cases: trim input, check for valid string, return safe fallback
    if (typeof fullName !== 'string') {
      return '';
    }
    
    const trimmedName = fullName.trim();
    if (!trimmedName) {
      return '';
    }
    
    // Split on whitespace and filter out empty segments to handle extra spaces
    const words = trimmedName.split(/\s+/).filter(word => word.length > 0);
    
    // Map each word to its first character, uppercase and slice to two characters
    return words
      .map(word => word.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const sanitizedImageUrl = sanitizeUserImageUrl(src);
  const initials = getInitials(name);

  const statusClasses = {
    active: 'bg-emerald-500',
    inactive: 'bg-amber-400'
  } as const;

  const statusSizeClasses = {
    xs: 'h-1.5 w-1.5',
    sm: 'h-2 w-2',
    md: 'h-2.5 w-2.5',
    lg: 'h-3 w-3',
    xl: 'h-3.5 w-3.5'
  } as const;

  return (
    <div className={`${sizeClasses[size]} relative flex-shrink-0 rounded-full ${className}`}>
      <div className={`${bgClassName ?? 'glass-input'} h-full w-full rounded-full text-input-text flex items-center justify-center overflow-hidden shadow-sm ring-1 ring-black/5 dark:ring-white/5`}>
        {sanitizedImageUrl && !hasImgError ? (
          <img 
            src={sanitizedImageUrl} 
            alt={name} 
            className="h-full w-full object-cover"
            onError={() => setHasImgError(true)}
          />
        ) : (
          initials ? (
            <span className={`font-medium text-input-text ${textSizeClasses[size]}`}>{initials}</span>
          ) : (
            <Icon icon={UserIcon} className="h-1/2 w-1/2 text-input-placeholder" />
          )
        )}
      </div>
      {status && (
        <span
          className={`absolute bottom-0 right-0 translate-x-1/4 translate-y-1/4 rounded-full ${statusClasses[status]} ${statusSizeClasses[size]}`}
          aria-hidden="true"
        />
      )}
    </div>
  );
};
