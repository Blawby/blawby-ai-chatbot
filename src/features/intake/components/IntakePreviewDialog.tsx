import { Dialog, DialogBody, DialogFooter } from '@/shared/ui/dialog';
import { Button } from '@/shared/ui/Button';
import { IntakeFlowPreview } from './BuilderWidgetPreview';
import type { IntakeTemplate } from '@/shared/types/intake';

type IntakePreviewDialogProps = {
  isOpen: boolean;
  template: IntakeTemplate;
  practiceName?: string | null;
  practiceLogo?: string | null;
  practiceSubtitle?: string | null;
  currencyCode?: string;
  onConfirm: () => Promise<void> | void;
  onCancel: () => void;
  loading?: boolean;
};

export const IntakePreviewDialog = ({
  isOpen,
  template,
  practiceName,
  practiceLogo,
  practiceSubtitle,
  currencyCode = 'USD',
  onConfirm,
  onCancel,
  loading = false,
}: IntakePreviewDialogProps) => {
  return (
    <Dialog
      isOpen={isOpen}
      onClose={loading ? () => {} : onCancel}
      title="Preview Form"
      description="Review your intake form before publishing."
      contentClassName="max-w-4xl"
      disableBackdropClick={loading}
    >
      <DialogBody className="space-y-4">
        <div className="flex justify-center py-4">
          <IntakeFlowPreview
            template={template}
            practiceName={practiceName}
            practiceLogo={practiceLogo}
            practiceSubtitle={practiceSubtitle}
            currencyCode={currencyCode}
            interactive={false}
          />
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onClick={onCancel} disabled={loading}>
          Continue Editing
        </Button>
        <Button
          onClick={async () => {
            await onConfirm();
          }}
          disabled={loading}
        >
          {loading ? 'Publishing...' : 'Publish'}
        </Button>
      </DialogFooter>
    </Dialog>
  );
};
