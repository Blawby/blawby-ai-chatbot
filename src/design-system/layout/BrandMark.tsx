import { cn } from '@/shared/utils/cn';

export interface BrandMarkProps {
  size?: 'sm' | 'md';
  glyph?: string;
  word?: string;
  className?: string;
}

export function BrandMark({
  size = 'md',
  glyph = 'B',
  word = 'Blawby',
  className,
}: BrandMarkProps) {
  return (
    <span className={cn('brand-mark', size === 'sm' && 'brand-mark-sm', className)}>
      <span className="brand-mark-glyph" aria-hidden="true">
        {glyph}
      </span>
      <span className="brand-mark-word">{word}</span>
    </span>
  );
}
