/**
 * Avatar - Atom Component
 * Pure user avatar display with image/initials fallback.
 */

import { useState, useEffect } from 'preact/hooks';
import { sanitizeUserImageUrl } from '@/shared/utils/urlValidation';

interface AvatarProps {
  src?: string | null;
  name: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const Avatar = ({ src, name, size = 'md', className = '' }: AvatarProps) => {
  const [hasImgError, setHasImgError] = useState(false);

  // Reset error state when src changes so new images can be attempted
  useEffect(() => {
    setHasImgError(false);
  }, [src]);

  const sizeClasses = {
    sm: 'w-6 h-6',
    md: 'w-9 h-9', // 36px to match original main look
    lg: 'w-10 h-10'
  } as const;

  const textSizeClasses = {
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

  return (
    <div className={`${sizeClasses[size]} rounded-full bg-gray-600 dark:bg-gray-700 flex items-center justify-center flex-shrink-0 overflow-hidden ${className}`}>
      {sanitizedImageUrl && !hasImgError ? (
        <img 
          src={sanitizedImageUrl} 
          alt={name} 
          className="w-full h-full object-cover"
          onError={() => setHasImgError(true)}
        />
      ) : (
        <span className={`text-white font-medium ${textSizeClasses[size]}`}>{getInitials(name)}</span>
      )}
    </div>
  );
};


