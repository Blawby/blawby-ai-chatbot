import type { ComponentChildren } from 'preact';
import { Dialog } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { FormActions } from '@/shared/ui/form';
import { useCreateContact } from '@/shared/hooks/useCreateContact';
import { useToastContext } from '@/shared/contexts/ToastContext';

type AddContactDialogProps = {
  practiceId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void | Promise<void>;
  title?: ComponentChildren;
  submitText?: string;
};

export const AddContactDialog = ({
  practiceId,
  isOpen,
  onClose,
  onSuccess,
  title = 'Invite contact',
  submitText = 'Send invite',
}: AddContactDialogProps) => {
  const { showSuccess, showError, showWarning } = useToastContext();
  const createContact = useCreateContact(practiceId);
  const submitLabel = createContact.submitting ? 'Sending...' : submitText;

  const handleClose = () => {
    createContact.reset();
    onClose();
  };

  const handleSubmit = async () => {
    try {
      await createContact.submit();
      // Close and reset the dialog immediately so duplicate submissions are
      // prevented even if a downstream post-create step fails.
      handleClose();
      // Run optional post-create hook but treat failures as warnings — the
      // contact was created successfully.
      if (onSuccess) {
        try {
          await onSuccess();
        } catch (err) {
          showWarning(
            'Contact created, post-create action failed',
            err instanceof Error ? err.message : 'A post-create step failed'
          );
          return;
        }
      }
      showSuccess('Invite sent', 'The invitation has been sent.');
    } catch (error) {
      showError(
        'Could not send invite',
        error instanceof Error ? error.message : 'Please try again.'
      );
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleClose}
      title={title}
      contentClassName="!max-w-2xl"
    >
      <div className="space-y-5 px-6 pb-6">
        <Input
          label="Contact email"
          type="email"
          value={createContact.form.email}
          onChange={(value) => createContact.updateField('email', value)}
          placeholder="jane@lawfirm.com"
          required
          disabled={createContact.submitting || !practiceId}
          autoComplete="email"
        />
        <FormActions
          className="justify-end gap-2"
          onCancel={handleClose}
          onSubmit={handleSubmit}
          submitType="button"
          submitText={submitLabel}
          disabled={createContact.submitting || !practiceId}
        />
      </div>
    </Dialog>
  );
};
