import { cn } from '@/shared/utils/cn';

export interface BrandMarkProps {
  size?: 'sm' | 'md';
  glyph?: string;
  word?: string;
  className?: string;
}

export function BrandMark({
  size = 'md',
  word = 'Blawby',
  className,
}: BrandMarkProps) {
  return (
    <span className={cn('brand-mark', size === 'sm' && 'brand-mark-sm', className)}>
      <span className="brand-mark-glyph" aria-hidden="true">
        <img src="/blawby-favicon-iframe.png" alt="" loading="lazy" decoding="async" />
      </span>
      <span className="brand-mark-word">{word}</span>
    </span>
  );
}
