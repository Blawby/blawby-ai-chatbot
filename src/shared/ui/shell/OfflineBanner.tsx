import { useEffect, useState } from 'preact/hooks';
import { cn } from '@/shared/utils/cn';
import { WifiOff } from 'lucide-preact';

export interface OfflineBannerProps {
  className?: string;
}

export function OfflineBanner({ className }: OfflineBannerProps) {
  const [offline, setOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const goOffline = () => setOffline(true);
    const goOnline = () => setOffline(false);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="alert"
      className={cn(
        'fixed top-0 inset-x-0 z-[400] flex items-center justify-center gap-2 px-4 py-2',
        'bg-warn text-surface-card text-sm font-medium backdrop-blur-sm',
        className,
      )}
    >
      <WifiOff size={14} />
      <span>You&apos;re offline. Some features may be unavailable.</span>
    </div>
  );
}
