import type { ComponentChildren } from 'preact';
import { Dialog } from '../dialog/Dialog';
import { FormActions } from '../form/FormActions';
import { Input } from '../input/Input';
import { useCreateContact } from '../../hooks/useCreateContact';
import { useToastContext } from '../../contexts/ToastContext';

type AddPersonDialogProps = {
  practiceId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void | Promise<void>;
  title?: ComponentChildren;
  submitText?: string;
};

export const AddPersonDialog = ({
  practiceId,
  isOpen,
  onClose,
  onSuccess,
  title = 'Invite person',
  submitText = 'Send invite',
}: AddPersonDialogProps) => {
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
      handleClose();
      if (onSuccess) {
        try {
          await onSuccess();
        } catch (err) {
          showWarning(
            'Person created, post-create action failed',
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
          label="Email address"
          type="email"
          value={createContact.form.email}
          onChange={(value: string) => createContact.updateField('email', value)}
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
          submitDisabled={createContact.submitting || !practiceId || !createContact.form.email.trim()}
        />
      </div>
    </Dialog>
  );
};
