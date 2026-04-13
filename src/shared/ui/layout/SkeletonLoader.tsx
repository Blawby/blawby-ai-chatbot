import { cn } from '@/shared/utils/cn';

export type SkeletonVariant = 'text' | 'title' | 'avatar' | 'button' | 'input' | 'chip' | 'rect';

export interface SkeletonLoaderProps {
 variant?: SkeletonVariant;
 lines?: number;
 width?: string;
 height?: string;
 className?: string;
 rounded?: string;
 wide?: boolean;
}

const SKELETON_DEFAULTS: Record<SkeletonVariant, { width: string; height: string; rounded: string }> = {
 text: { width: 'w-20', height: 'h-3', rounded: 'rounded' },
 title: { width: 'w-32', height: 'h-4', rounded: 'rounded' },
 avatar: { width: 'w-9', height: 'h-9', rounded: 'rounded-full' },
 button: { width: 'w-24', height: 'h-9', rounded: 'rounded-md' },
 input: { width: 'w-full', height: 'h-9', rounded: 'rounded-md' },
 chip: { width: 'w-16', height: 'h-6', rounded: 'rounded-full' },
 rect: { width: 'w-full', height: 'h-4', rounded: 'rounded' }
};

export const SkeletonLoader = ({
 variant = 'rect',
 lines = 1,
 width,
 height,
 className,
 rounded,
 wide = false
}: SkeletonLoaderProps) => {
 const defaults = SKELETON_DEFAULTS[variant];
 const resolvedWidth = width ?? (variant === 'text' && wide ? 'w-28' : defaults.width);
 const resolvedHeight = height ?? defaults.height;
 const resolvedRounded = rounded ?? defaults.rounded;
 const lineCount = Math.max(1, lines);

 return (
  <div className={lineCount > 1 ? 'space-y-2' : undefined}>
   {Array.from({ length: lineCount }, (_, index) => (
    <div
     key={index}
     className={cn(
      'animate-pulse bg-[rgb(var(--accent-foreground)/0.1)]',
      resolvedHeight,
      resolvedWidth,
      resolvedRounded,
      className
     )}
    />
   ))}
  </div>
 );
};
