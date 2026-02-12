/**
 * Avatar - Atom Component
 * Pure user avatar display with image/initials fallback.
 */

import { useState, useEffect } from 'preact/hooks';
import { sanitizeUserImageUrl } from '@/shared/utils/urlValidation';

interface AvatarProps {
  src?: string | null;
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
  status?: 'active' | 'inactive';
}

export const Avatar = ({ src, name, size = 'md', className = '', status }: AvatarProps) => {
  const [hasImgError, setHasImgError] = useState(false);

  // Reset error state when src changes so new images can be attempted
  useEffect(() => {
    setHasImgError(false);
  }, [src]);

  const sizeClasses = {
    xs: 'w-4 h-4',
    sm: 'w-6 h-6',
    md: 'w-9 h-9', // 36px to match original main look
    lg: 'w-10 h-10'
  } as const;

  const textSizeClasses = {
    xs: 'text-[10px]',
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base'
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

  const statusClasses = {
    active: 'bg-emerald-500',
    inactive: 'bg-amber-400'
  } as const;

  const statusSizeClasses = {
    xs: 'h-1.5 w-1.5',
    sm: 'h-2 w-2',
    md: 'h-2.5 w-2.5',
    lg: 'h-3 w-3'
  } as const;

  return (
    <div className={`${sizeClasses[size]} relative flex-shrink-0 rounded-full ${className}`}>
      <div className="h-full w-full rounded-full bg-white/15 text-input-text ring-1 ring-white/20 flex items-center justify-center overflow-hidden dark:bg-white/10 dark:ring-white/15">
        {sanitizedImageUrl && !hasImgError ? (
          <img 
            src={sanitizedImageUrl} 
            alt={name} 
            className="h-full w-full object-cover"
            onError={() => setHasImgError(true)}
          />
        ) : (
          <span className={`text-white font-medium ${textSizeClasses[size]}`}>{getInitials(name)}</span>
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
