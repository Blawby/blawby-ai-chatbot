import type { JSX } from 'preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { cn } from '@/shared/utils/cn';
import { ImageOff } from 'lucide-preact';

export interface ImageProps extends Omit<JSX.HTMLAttributes<HTMLImageElement>, 'loading' | 'onError' | 'onLoad'> {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  aspectRatio?: string;
  lazy?: boolean;
  fallback?: preact.ComponentChildren;
  blurPlaceholder?: string;
  className?: string;
  containerClassName?: string;
}

export function Image({
  src,
  alt,
  width,
  height,
  aspectRatio,
  lazy = true,
  fallback,
  blurPlaceholder,
  className,
  containerClassName,
  ...rest
}: ImageProps) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    setStatus('loading');
  }, [src]);

  const handleLoad = useCallback(() => setStatus('loaded'), []);
  const handleError = useCallback(() => setStatus('error'), []);

  return (
    <div
      className={cn(
        'relative overflow-hidden bg-black/3 dark:bg-white/3 rounded-xl',
        containerClassName,
      )}
      style={{ aspectRatio, width, height }}
    >
      {status === 'loading' && blurPlaceholder && (
        <img
          src={blurPlaceholder}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover blur-xl scale-110"
        />
      )}
      {status === 'loading' && !blurPlaceholder && (
        <div className="absolute inset-0 animate-pulse bg-black/5 dark:bg-white/5" />
      )}
      {status === 'error' ? (
        <div className="absolute inset-0 flex items-center justify-center text-input-placeholder/50">
          {fallback ?? <ImageOff size={24} />}
        </div>
      ) : (
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          width={width}
          height={height}
          loading={lazy ? 'lazy' : 'eager'}
          onLoad={handleLoad}
          onError={handleError}
          className={cn(
            'w-full h-full object-cover transition-opacity duration-300',
            status === 'loaded' ? 'opacity-100' : 'opacity-0',
            className,
          )}
          {...rest}
        />
      )}
    </div>
  );
}
