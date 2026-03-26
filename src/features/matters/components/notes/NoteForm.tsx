import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { Button } from '@/shared/ui/Button';
import { MarkdownUploadTextarea } from '@/shared/ui/input';
import type { MatterNote } from '@/features/matters/data/matterTypes';

export type NoteFormValues = {
  content: string;
};

interface NoteFormProps {
  initialNote?: MatterNote;
  practiceId?: string | null;
  onSubmit: (values: NoteFormValues) => void;
  onCancel: () => void;
  onDelete?: () => void;
  isSubmitting?: boolean;
}

export const NoteForm = ({ initialNote, practiceId, onSubmit, onCancel, onDelete, isSubmitting = false }: NoteFormProps) => {
  const [content, setContent] = useState(initialNote?.content ?? '');
  const [error, setError] = useState('');

  const handleSubmit = (event: JSX.TargetedEvent<HTMLFormElement, Event>) => {
    event.preventDefault();
    const trimmed = content.trim();
    if (!trimmed) {
      setError('Please add note content before saving.');
      return;
    }
    setError('');
    onSubmit({ content: trimmed });
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <MarkdownUploadTextarea
        label="Content"
        value={content}
        onChange={(value) => {
          setContent(value);
          if (error && value.trim()) {
            setError('');
          }
        }}
        practiceId={practiceId}
        rows={5}
        maxLength={5000}
        placeholder="Capture key updates, decisions, or follow-ups for this matter."
      />
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
      <div className="flex flex-wrap items-center justify-end gap-3">
        {onDelete && (
        <Button type="button" variant="danger" size="sm" onClick={onDelete} className="mr-auto" disabled={isSubmitting}>
          Delete note
        </Button>
      )}
      <Button type="button" variant="secondary" onClick={onCancel} disabled={isSubmitting}>
        Cancel
      </Button>
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Saving...' : initialNote ? 'Update note' : 'Create note'}
      </Button>
    </div>
  </form>
  );
};
