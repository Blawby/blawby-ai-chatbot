import type { ComponentChildren } from 'preact';
import { Dialog } from '../dialog/Dialog';
import { FormActions } from '../form/FormActions';

type AddPersonDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  title?: ComponentChildren;
};

export const AddPersonDialog = ({
  isOpen,
  onClose,
  title = 'Invite person',
}: AddPersonDialogProps) => {
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
        {/* TODO/FIXME: Add contact email input and wire to useCreateContact when available.
            Currently a placeholder. */}
        <FormActions
          className="justify-end gap-2"
          onCancel={handleClose}
        />
      </div>
    </Dialog>
  );
};
