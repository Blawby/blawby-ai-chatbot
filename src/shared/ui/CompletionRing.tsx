import { FunctionComponent } from 'preact';
import { useMemo } from 'preact/hooks';

interface CompletionRingProps {
 score: number;
 size?: number;
 strokeWidth?: number;
 className?: string;
}

export const CompletionRing: FunctionComponent<CompletionRingProps> = ({
 score,
 size = 40,
 strokeWidth = 3,
 className = '',
}) => {
 const radius = (size - strokeWidth) / 2;
 const circumference = radius * 2 * Math.PI;
 const offset = circumference - (Math.min(100, Math.max(0, score)) / 100) * circumference;

 const color = useMemo(() => {
  if (score < 40) return 'rgb(var(--error-foreground))';
  if (score < 80) return 'rgb(var(--warning-foreground))';
  return 'rgb(var(--success-foreground))';
 }, [score]);

 return (
  <div className={`relative inline-flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
   <svg className="transform -rotate-90" width={size} height={size}>
    {/* Background circle */}
    <circle
     cx={size / 2}
     cy={size / 2}
     r={radius}
     stroke="currentColor"
     strokeWidth={strokeWidth}
     fill="transparent"
     className="text-input-placeholder/20 dark:text-line-glass/10"
    />
    {/* Progress circle */}
    <circle
     cx={size / 2}
     cy={size / 2}
     r={radius}
     stroke={color}
     strokeWidth={strokeWidth}
     fill="transparent"
     strokeDasharray={circumference}
     style={{ strokeDashoffset: offset, transition: 'stroke-dashoffset 0.5s ease-in-out, stroke 0.5s ease-in-out' }}
     strokeLinecap="round"
    />
   </svg>
   <span className="absolute text-[10px] font-bold" style={{ color }}>
    {Math.round(score)}%
   </span>
  </div>
 );
};
