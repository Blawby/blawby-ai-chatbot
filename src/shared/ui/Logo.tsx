import { ComponentChildren } from 'preact';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  className?: string;
  children?: ComponentChildren;
}

export const Logo = ({ size = 'md', showText = true, className = '', children }: LogoProps) => {
  const sizeClasses = {
    sm: 'h-6 w-6',
    md: 'h-8 w-8',
    lg: 'h-12 w-12',
    xl: 'h-16 w-16'
  };

  const textSizeClasses = {
    sm: 'text-lg',
    md: 'text-xl',
    lg: 'text-2xl',
    xl: 'text-3xl'
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <img
        src="/blawby-favicon-iframe.png"
        alt="Blawby AI"
        className={`${sizeClasses[size]} object-contain`}
      />
      {showText && (
        <span className={`font-bold text-input-text ${textSizeClasses[size]}`}>
          Blawby AI
        </span>
      )}
      {children}
    </div>
  );
};
