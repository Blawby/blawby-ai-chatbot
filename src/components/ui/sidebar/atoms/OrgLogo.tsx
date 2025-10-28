/**
 * OrgLogo - Atom Component
 * 
 * Pure organization logo/image display. No interactions, no state.
 * Just renders the organization logo with proper styling.
 */

interface OrgLogoProps {
  src: string;
  alt: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const OrgLogo = ({ 
  src, 
  alt, 
  size = 'md',
  className = ''
}: OrgLogoProps) => {
  const sizeClasses = {
    sm: 'w-6 h-6',
    md: 'w-8 h-8',
    lg: 'w-10 h-10'
  };

  return (
    <img 
      src={src} 
      alt={alt}
      className={`${sizeClasses[size]} rounded-lg object-cover ${className}`}
    />
  );
};
