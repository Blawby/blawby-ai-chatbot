import { useEffect, useState } from 'preact/hooks';
import { Button } from '@/shared/ui/Button';
import { APP_APPLY_UPDATE_EVENT, APP_UPDATE_AVAILABLE_EVENT } from '@/shared/lib/swUpdate';

/**
 * Sticky bottom-right banner shown when a new service worker is waiting.
 * Clicking Refresh dispatches `app:apply-update` which the swUpdate listener
 * picks up to activate the new SW and reload.
 *
 * Kept out of the main toast system because that system doesn't support
 * action buttons and these notifications must persist until acknowledged.
 */
export const UpdateAvailableToast = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onUpdate = () => setVisible(true);
    window.addEventListener(APP_UPDATE_AVAILABLE_EVENT, onUpdate);
    return () => window.removeEventListener(APP_UPDATE_AVAILABLE_EVENT, onUpdate);
  }, []);

  if (!visible) return null;

  const handleRefresh = () => {
    window.dispatchEvent(new CustomEvent(APP_APPLY_UPDATE_EVENT));
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-lg border border-card-border bg-card px-4 py-3 shadow-lg backdrop-blur"
    >
      <span className="text-sm text-heading">A new version is available.</span>
      <Button variant="primary" onClick={handleRefresh}>Refresh</Button>
    </div>
  );
};
