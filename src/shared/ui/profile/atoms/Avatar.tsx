import { User } from 'lucide-preact';
import { useState, useEffect } from 'preact/hooks';

import { Icon } from '@/shared/ui/Icon';
import { cn } from '@/shared/utils/cn';
import { sanitizeUserImageUrl } from '@/shared/utils/urlValidation';


export type AvatarKind = 'ai' | 'user' | 'staff';

interface AvatarProps {
  src?: string | null;
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  /**
   * @deprecated DS .avatar uses --card via the class. Caller overrides via
   * `className` are still respected (Tailwind utilities beat layer-components).
   */
  bgClassName?: string;
  status?: 'active' | 'inactive' | 'offline';
  /** Accessible label for status dot. Defaults to status value. */
  statusLabel?: string;
  /**
   * DS avatar kind controls fill + ink colors:
   * - 'ai' (default): gold serif glyph on ink
   * - 'user': paper sans initials on ink gradient
   * - 'staff': accent-deep sans initials on accent-soft
   */
  kind?: AvatarKind;
}

export const Avatar = ({
  src,
  name,
  size = 'md',
  className = '',
  status,
  statusLabel,
  kind = 'ai',
}: AvatarProps) => {
  const [hasImgError, setHasImgError] = useState(false);

  useEffect(() => {
    setHasImgError(false);
  }, [src]);

  const sizeClasses = {
    xs: 'w-4 h-4 text-[10px]',
    sm: 'w-6 h-6 text-xs',
    md: '',
    lg: 'w-10 h-10 text-base',
    xl: 'w-36 h-36 text-6xl'
  } as const;

  const kindClass = kind === 'user' ? 'user' : kind === 'staff' ? 'staff' : null;

  const getInitials = (fullName: string) => {
    if (typeof fullName !== 'string') {
      return '';
    }

    const trimmedName = fullName.trim();
    if (!trimmedName) {
      return '';
    }

    const words = trimmedName.split(/\s+/).filter(word => word.length > 0);

    return words
      .map(word => word.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const sanitizedImageUrl = sanitizeUserImageUrl(src);
  const initials = getInitials(name);

  const statusClasses = {
    active: 'bg-pos',
    inactive: 'bg-warn',
    offline: 'bg-dim ring-1 ring-card'
  } as const;

  const statusSizeClasses = {
    xs: 'h-1.5 w-1.5',
    sm: 'h-2 w-2',
    md: 'h-2.5 w-2.5',
    lg: 'h-3 w-3',
    xl: 'h-3.5 w-3.5'
  } as const;

  return (
    <div className={cn('avatar relative', kindClass, sizeClasses[size], className)}>
      {sanitizedImageUrl && !hasImgError ? (
        <img
          src={sanitizedImageUrl}
          alt={name}
          className="h-full w-full object-cover rounded-full"
          onError={() => setHasImgError(true)}
        />
      ) : (
        initials ? (
          <span>{initials}</span>
        ) : (
          <Icon icon={User} className="h-1/2 w-1/2" />
        )
      )}
      {status && (
        <>
          <span
            className={cn(
              'absolute bottom-0 right-0 translate-x-1/4 translate-y-1/4 rounded-full',
              statusClasses[status],
              statusSizeClasses[size]
            )}
            aria-hidden="true"
          />
          <span className="sr-only">{statusLabel || status}</span>
        </>
      )}
    </div>
  );
};
