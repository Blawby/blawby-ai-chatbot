import { FunctionComponent, ComponentChildren } from 'preact';
import { useMemo } from 'preact/hooks';
import { cn } from '@/shared/utils/cn';

export interface ProgressRingProps {
  /** Progress percentage (0-100) */
  progress: number;
  /** Size in pixels */
  size?: number;
  /** Stroke width in pixels */
  strokeWidth?: number;
  /** Optional explicit color. If omitted, will use score-based defaults (red/amber/green) or currentColor */
  color?: string;
  /** Use score-based traffic light colors (0-39: red, 40-79: amber, 80+: green) */
  useTrafficLights?: boolean;
  /** Content to show in the center of the ring */
  children?: ComponentChildren;
  /** Additional classes for the container */
  className?: string;
  /** Additional classes for the circle track */
  trackClassName?: string;
  /** Additional classes for the progress circle */
  progressClassName?: string;
  /** Icon or text size override if needed */
  fontSize?: string;
}

/**
 * A highly configurable progress ring component.
 * Consolidates multiple previous implementations of CompletionRing and ProgressRing.
 */
export const ProgressRing: FunctionComponent<ProgressRingProps> = ({
  progress,
  size = 40,
  strokeWidth = 3,
  color,
  useTrafficLights = false,
  children,
  className = '',
  trackClassName,
  progressClassName,
  fontSize,
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const clampedProgress = Math.min(100, Math.max(0, progress));
  const offset = circumference - (clampedProgress / 100) * circumference;

  const resolvedColor = useMemo(() => {
    if (color) return color;
    if (!useTrafficLights) return 'currentColor';
    
    if (clampedProgress < 40) return 'rgb(239, 68, 68)'; // red-500
    if (clampedProgress < 80) return 'rgb(245, 158, 11)'; // amber-500
    return 'rgb(34, 197, 94)'; // green-500
  }, [color, useTrafficLights, clampedProgress]);

  return (
    <div 
      className={cn('relative inline-flex items-center justify-center shrink-0', className)} 
      style={{ width: size, height: size }}
    >
      <svg className="transform -rotate-90" width={size} height={size}>
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="transparent"
          className={cn('text-gray-200 dark:text-white/10', trackClassName)}
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={resolvedColor}
          strokeWidth={strokeWidth}
          fill="transparent"
          strokeDasharray={circumference}
          style={{ 
            strokeDashoffset: offset, 
            transition: 'stroke-dashoffset 0.5s ease-in-out, stroke 0.5s ease-in-out' 
          }}
          strokeLinecap="round"
          className={cn('transition-all', progressClassName)}
        />
      </svg>
      {children !== undefined && (
        <div 
          className="absolute inset-0 flex items-center justify-center text-center"
          style={{ 
            color: resolvedColor !== 'currentColor' ? resolvedColor : undefined,
            fontSize: fontSize ?? `${size * 0.25}px`
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
};
