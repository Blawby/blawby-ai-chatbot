import { useEffect, useState } from 'preact/hooks';
import { Button } from '@/shared/ui/Button';
import type { RefObject } from 'preact/compat';
import type { InvoiceFormHandle } from '@/features/invoices/components/InvoiceForm';

interface InvoiceEditHeaderActionsProps {
  formRef: RefObject<InvoiceFormHandle>;
}

const formatTime = (date: Date): string =>
  date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

export const InvoiceEditHeaderActions = ({ formRef }: InvoiceEditHeaderActionsProps) => {
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [isPreviewHidden, setIsPreviewHidden] = useState(false);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail as { timestamp?: string } | undefined;
      if (detail?.timestamp) {
        setLastSavedAt(new Date(detail.timestamp));
      }
    };
    window.addEventListener('invoice:draft-saved', handler as EventListener);
    return () => window.removeEventListener('invoice:draft-saved', handler as EventListener);
  }, []);

  const togglePreview = () => {
    setIsPreviewHidden((prev) => {
      const next = !prev;
      try {
        window.dispatchEvent(
          new CustomEvent('invoice:hide-preview', { detail: { force: next ? 'hide' : 'show' } })
        );
      } catch {
        /* SSR / no window */
      }
      return next;
    });
  };

  const handleReview = () => {
    formRef.current?.requestSend();
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      {lastSavedAt ? (
        <span className="text-xs text-input-placeholder">
          Draft saved at {formatTime(lastSavedAt)}
        </span>
      ) : null}
      <Button variant="ghost" size="sm" onClick={togglePreview}>
        {isPreviewHidden ? 'Show preview' : 'Hide preview'}
      </Button>
      <Button onClick={handleReview}>Review invoice</Button>
    </div>
  );
};
