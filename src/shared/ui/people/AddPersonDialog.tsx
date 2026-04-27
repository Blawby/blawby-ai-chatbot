import type { ComponentChildren } from 'preact';
import { Dialog } from '../dialog/Dialog';
import { FormActions } from '../form/FormActions';

type AddContactDialogProps = {
  practiceId: string | null;
  isOpen: boolean;
  onClose: () => void;
  title?: ComponentChildren;
  submitText?: string;
};

export const AddContactDialog = ({
  isOpen,
  onClose,
  title = 'Invite contact',
}: Omit<AddContactDialogProps, 'practiceId' | 'submitText'>) => {
  const handleClose = () => {
    onClose();
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleClose}
      title={title}
      contentClassName="!max-w-2xl"
    >
      <div className="space-y-5 px-6 pb-6">
        {/* Contact email input removed due to missing createContact */}
        <FormActions
          className="justify-end gap-2"
          onCancel={handleClose}
        />
      </div>
    </Dialog>
  );
};
