import { ExternalLink } from 'lucide-preact';

import { Dialog, DialogBody, DialogFooter } from '@/shared/ui/dialog';
import { Button } from '@/shared/ui/Button';
import { WidgetPreviewFrame } from '@/features/settings/components/WidgetPreviewFrame';
import { getPublicFormUrl } from '@/features/intake/components/EmbedCodeBlock';
import type { IntakeTemplate } from '@/shared/types/intake';
import type { WidgetPreviewConfig } from '@/shared/types/widgetPreview';
import type { MinorAmount } from '@/shared/utils/money';
import { isMinorAmount, asMinor } from '@/shared/utils/money';

type IntakePreviewDialogProps = {
  isOpen: boolean;
  template: IntakeTemplate;
  practiceSlug?: string | null;
  practiceName?: string | null;
  practiceLogo?: string | null;
  practiceAccentColor?: string;
  currencyCode?: string;
  onConfirm: () => Promise<void> | void;
  onCancel: () => void;
  loading?: boolean;
};

export const IntakePreviewDialog = ({
  isOpen,
  template,
  practiceSlug,
  practiceName,
  practiceLogo,
  practiceAccentColor,
  currencyCode = 'USD',
  onConfirm,
  onCancel,
  loading = false,
}: IntakePreviewDialogProps) => {
  const previewConfig: WidgetPreviewConfig = {
    name: practiceName ?? undefined,
    profileImage: practiceLogo ?? null,
    accentColor: practiceAccentColor,
    introMessage: template.introMessage ?? null,
    legalDisclaimer: template.legalDisclaimer ?? null,
    consultationFee: isMinorAmount(template.consultationFee)
      ? asMinor(template.consultationFee)
      : null,
    paymentLinkEnabled: template.paymentLinkEnabled,
    currency: currencyCode,
    intakeTemplate: template,
  };

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
          <WidgetPreviewFrame
            practiceSlug={practiceSlug ?? null}
            scenario="intake-template"
            config={previewConfig}
            showTitle={false}
            viewportClassName="h-[580px]"
            initialIntakeStep="conversation"
          />
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onClick={onCancel} disabled={loading}>
          Continue Editing
        </Button>
        {practiceSlug && template.slug ? (
          <Button
            type="button"
            variant="icon"
            size="icon-sm"
            icon={ExternalLink}
            aria-label="Open published form in new tab"
            onClick={() => {
              window.open(getPublicFormUrl(practiceSlug, template.slug), '_blank', 'noopener,noreferrer');
            }}
            disabled={loading}
          />
        ) : null}
        <Button
          onClick={async () => {
            setPublishError(null);
            setIsPublishing(true);
            try {
              await onConfirm();
              setIsPublishing(false);
            } catch (err) {
              setPublishError(err instanceof Error ? err.message : String(err));
              setIsPublishing(false);
            }
          }}
          disabled={loading || isPublishing}
        >
          {isPublishing ? 'Publishing...' : 'Publish'}
        </Button>
        {publishError && (
          <div className="mt-2 text-error bg-error/10 rounded px-3 py-2 text-sm">{publishError}</div>
        )}
      </DialogFooter>
    </Dialog>
  );
};
