/**
 * Avatar - Atom Component
 * Pure user avatar display with image/initials fallback.
 */

import { sanitizeUserImageUrl } from '../../../../utils/urlValidation';

interface AvatarProps {
  src?: string | null;
  name: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const Avatar = ({ src, name, size = 'md', className = '' }: AvatarProps) => {
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

  const getInitials = (fullName: string) => fullName
    .split(' ')
    .map(word => word.charAt(0))
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const sanitizedImageUrl = sanitizeUserImageUrl(src);

  return (
    <div className={`${sizeClasses[size]} rounded-full bg-gray-600 dark:bg-gray-700 flex items-center justify-center flex-shrink-0 overflow-hidden ${className}`}>
      {sanitizedImageUrl ? (
        <img 
          src={sanitizedImageUrl} 
          alt={name} 
          className="w-full h-full object-cover"
          onError={(e) => {
            // Fallback to initials if image fails to load
            const target = e.target as HTMLImageElement;
            target.style.display = 'none';
            const parent = target.parentElement;
            if (parent) {
              parent.innerHTML = `<span class="text-white font-medium ${textSizeClasses[size]}">${getInitials(name)}</span>`;
            }
          }}
        />
      ) : (
        <span className={`text-white font-medium ${textSizeClasses[size]}`}>{getInitials(name)}</span>
      )}
    </div>
  );
};


