import type { ComponentChildren } from 'preact';
import { useCallback, useRef, useState } from 'preact/hooks';
import { cn } from '@/shared/utils/cn';
import { ChevronLeft, ChevronRight } from 'lucide-preact';

export interface CarouselProps {
  children: ComponentChildren[];
  showArrows?: boolean;
  showDots?: boolean;
  className?: string;
}

export function Carousel({
  children,
  showArrows = true,
  showDots = true,
  className,
}: CarouselProps) {
  const [current, setCurrent] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const total = children.length;

  const goTo = useCallback(
    (index: number) => {
      const next = ((index % total) + total) % total;
      setCurrent(next);
      trackRef.current?.children[next]?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'start',
      });
    },
    [total],
  );

  const prev = () => goTo(current - 1);
  const next = () => goTo(current + 1);

  return (
    <div className={cn('relative group', className)} aria-roledescription="carousel">
      <div
        ref={trackRef}
        className="flex overflow-x-auto snap-x snap-mandatory scrollbar-none rounded-xl"
        onScroll={(e) => {
          const el = e.target as HTMLDivElement;
          const idx = Math.round(el.scrollLeft / el.clientWidth);
          if (idx !== current) setCurrent(idx);
        }}
      >
        {children.map((child, i) => (
          <div
            key={i}
            role="group"
            aria-roledescription="slide"
            aria-label={`Slide ${i + 1} of ${total}`}
            className="w-full flex-none snap-start"
          >
            {child}
          </div>
        ))}
      </div>

      {showArrows && total > 1 && (
        <>
          <button
            type="button"
            onClick={prev}
            aria-label="Previous slide"
            className="absolute left-2 top-1/2 -translate-y-1/2 btn btn-secondary btn-icon-sm opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            onClick={next}
            aria-label="Next slide"
            className="absolute right-2 top-1/2 -translate-y-1/2 btn btn-secondary btn-icon-sm opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
          >
            <ChevronRight size={18} />
          </button>
        </>
      )}

      {showDots && total > 1 && (
        <div className="flex items-center justify-center gap-1.5 mt-3">
          {children.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Go to slide ${i + 1}`}
              className={cn(
                'w-1.5 h-1.5 rounded-full transition-all',
                i === current
                  ? 'bg-accent-500 w-4'
                  : 'bg-black/15 dark:bg-white/15',
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}
