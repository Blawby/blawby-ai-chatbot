/**
 * UploadProgressRing - Atom Component
 *
 * Pure circular progress indicator for in-flight file uploads. Distinct
 * from the general-purpose ProgressRing in shared/ui because it uses
 * upload-specific theme tokens (--*-file-progress-*) and a sm/md/lg size
 * enum tuned for icon overlays.
 */

import { cn } from '@/shared/utils/cn';

interface UploadProgressRingProps {
  progress: number; // 0-100
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  'aria-label'?: string;
}

export const UploadProgressRing = ({
  progress,
  size = 'md',
  className,
  'aria-label': ariaLabel
}: UploadProgressRingProps) => {
  // Clamp progress to 0-100 range
  const clampedProgress = Math.min(100, Math.max(0, progress));

  if (process.env.NODE_ENV === 'development' && (progress < 0 || progress > 100)) {
    console.warn(`UploadProgressRing: progress value ${progress} is out of range (0-100). Clamped to ${clampedProgress}.`);
  }
  
  const sizeClasses = {
    sm: 'w-6 h-6',
    md: 'w-8 h-8',
    lg: 'w-10 h-10'
  };
  
  const radius = size === 'sm' ? 10 : size === 'md' ? 14 : 18;
  const circumference = 2 * Math.PI * radius;
  const strokeDasharray = `${(clampedProgress / 100) * circumference} ${circumference}`;

  return (
    <div className={cn('absolute inset-0 flex items-center justify-center', className)}>
      <svg 
        className={cn(
          '-rotate-90',
          sizeClasses[size]
        )} 
        viewBox={`0 0 ${radius * 2 + 4} ${radius * 2 + 4}`}
        role="img"
        aria-label={ariaLabel}
      >
      {/* Background circle */}
      <circle
        cx={radius + 2}
        cy={radius + 2}
        r={radius}
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
        className="text-light-file-progress-bg dark:text-dark-file-progress-bg"
      />
      {/* Progress circle */}
      <circle
        cx={radius + 2}
        cy={radius + 2}
        r={radius}
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
        className="text-light-file-progress-fill dark:text-dark-file-progress-fill transition-all duration-300"
        strokeDasharray={strokeDasharray}
      />
      </svg>
    </div>
  );
};
