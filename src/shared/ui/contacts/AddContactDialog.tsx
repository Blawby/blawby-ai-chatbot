import type { ComponentChildren } from 'preact';
import { Dialog } from '../dialog/Dialog';
import { FormActions } from '../form/FormActions';
import { EmailInput } from '../input/EmailInput';
import { useCreateContact } from '../../hooks/useCreateContact';
import { useToastContext } from '../../contexts/ToastContext';

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
    // Reset on dialog close — cancelled workflow starts fresh next open.
    // See docs/solutions/conventions/form-reset-pattern-2026-05-18.md.
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
        <EmailInput
          label="Contact email"
          value={createContact.form.email}
          onChange={(value: string) => createContact.updateField('email', value)}
          placeholder="jane@lawfirm.com"
          required
          disabled={createContact.submitting || !practiceId}
          showValidation
        />
        <FormActions
          className="justify-end gap-2"
          onCancel={handleClose}
          onSubmit={handleSubmit}
          submitType="button"
          submitText={submitLabel}
          submitDisabled={createContact.submitting || !practiceId || !createContact.form.email.trim()}
        />
      </div>
    </Dialog>
  );
};
