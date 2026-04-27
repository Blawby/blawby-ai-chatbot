import type { ComponentChildren } from 'preact';
import { Dialog } from '../dialog/Dialog';
import { FormActions } from '../form/FormActions';

type AddContactDialogProps = {
  _practiceId?: string | null;
  isOpen: boolean;
  onClose: () => void;
  _onSuccess?: () => void | Promise<void>;
  title?: ComponentChildren;
  _submitText?: string;
};

export const AddContactDialog = ({
  isOpen,
  onClose,
  title = 'Invite contact',
}: AddContactDialogProps) => {
  // const createContact = useCreateContact(practiceId);
  // const submitLabel = createContact.submitting ? 'Sending...' : submitText;

  const handleClose = () => {
    // createContact.reset();
    onClose();
  };

  // const handleSubmit = async () => {
  //   try {
  //     await createContact.submit();
  //     // Close and reset the dialog immediately so duplicate submissions are
  //     // prevented even if a downstream post-create step fails.
  //     handleClose();
  //     // Run optional post-create hook but treat failures as warnings — the
  //     // contact was created successfully.
  //     if (onSuccess) {
  //       try {
  //         await onSuccess();
  //       } catch (err) {
  //         showWarning(
  //           'Contact created, post-create action failed',
  //           err instanceof Error ? err.message : 'A post-create step failed'
  //         );
  //         return;
  //       }
  //     }
  //     showSuccess('Invite sent', 'The invitation has been sent.');
  //   } catch (error) {
  //     showError(
  //       'Could not send invite',
  //       error instanceof Error ? error.message : 'Please try again.'
  //     );
  //   }
  // };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleClose}
      title={title}
      contentClassName="!max-w-2xl"
    >
      <div className="space-y-5 px-6 pb-6">
        {/*
        <Input
          label="Contact email"
          type="email"
          value={createContact.form.email}
          onChange={(value: string) => createContact.updateField('email', value)}
          placeholder="jane@lawfirm.com"
          required
          disabled={createContact.submitting || !practiceId}
          autoComplete="email"
        />
        */}
        <FormActions
          className="justify-end gap-2"
          onCancel={handleClose}
        />
      </div>
    </Dialog>
  );
};
