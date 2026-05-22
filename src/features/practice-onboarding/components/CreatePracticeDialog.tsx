import { useState } from 'preact/hooks';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { Dialog } from '@/shared/ui/dialog/Dialog';
import { DialogBody } from '@/shared/ui/dialog/DialogBody';
import { DialogFooter } from '@/shared/ui/dialog/DialogFooter';
import { Input } from '@/shared/ui/input';
import { Button } from '@/shared/ui/Button';
import { LoadingSpinner } from '@/shared/ui/layout/LoadingSpinner';
import { useNavigation } from '@/shared/utils/navigation';
import { authClient, getSession } from '@/shared/lib/authClient';

type CreatedOrg = {
  id?: string | null;
  slug?: string | null;
  name?: string | null;
};

const slugify = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const unwrapCreated = (result: unknown): CreatedOrg | null => {
  if (!result || typeof result !== 'object') return null;
  const record = result as Record<string, unknown>;
  const data = (record.data ?? result) as Record<string, unknown> | null;
  if (!data || typeof data !== 'object') return null;
  return {
    id: typeof data.id === 'string' ? data.id : null,
    slug: typeof data.slug === 'string' ? data.slug : null,
    name: typeof data.name === 'string' ? data.name : null,
  };
};

interface CreatePracticeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called after the new practice is created and activated. */
  onCreated?: (org: CreatedOrg) => void;
}

export const CreatePracticeDialog = ({ isOpen, onClose, onCreated }: CreatePracticeDialogProps) => {
  const { showError, showSuccess } = useToastContext();
  const { navigate } = useNavigation();
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleClose = () => {
    if (submitting) return;
    setName('');
    onClose();
  };

  const handleSubmit = async (event?: Event) => {
    event?.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      showError('Practice name is too short', 'Use at least 2 characters.');
      return;
    }
    setSubmitting(true);
    try {
      const proposedSlug = slugify(trimmed);
      const created = unwrapCreated(
        await authClient.organization.create({
          name: trimmed,
          ...(proposedSlug ? { slug: proposedSlug } : {}),
        })
      );

      if (!created?.id) {
        throw new Error('Practice was not created');
      }

      await authClient.organization.setActive({ organizationId: created.id });
      await getSession().catch(() => undefined);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('auth:session-updated'));
      }

      showSuccess('Practice created', `${created.name ?? trimmed} is ready to go.`);
      onCreated?.(created);
      setName('');
      onClose();

      if (created.slug) {
        navigate(`/practice/${encodeURIComponent(created.slug)}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Please try again.';
      showError('Could not create practice', message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleClose}
      title="Create a practice"
      description="Set up a new workspace. You can fine-tune the details after it's live."
    >
      <form onSubmit={handleSubmit}>
        <DialogBody>
          <div className="space-y-4">
            <Input
              type="text"
              label="Practice name"
              placeholder="Acme Law"
              value={name}
              onChange={setName}
              required
              disabled={submitting}
            />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={submitting}>
            {submitting ? <LoadingSpinner size="md" ariaLabel="Creating practice" /> : 'Create practice'}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
};

export default CreatePracticeDialog;
