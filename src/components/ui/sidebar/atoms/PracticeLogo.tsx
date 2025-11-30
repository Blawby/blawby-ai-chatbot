/**
 * PracticeLogo - Atom Component
 * 
 * Pure practice logo/image display. No interactions, no state.
 * Just renders the practice logo with proper styling.
 */

interface PracticeLogoProps {
  src: string;
  alt: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const PracticeLogo = ({ 
  src, 
  alt, 
  size = 'md',
  className = ''
}: PracticeLogoProps) => {
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
