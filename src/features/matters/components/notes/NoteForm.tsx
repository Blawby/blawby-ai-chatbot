import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { Button } from '@/shared/ui/Button';
import { Textarea } from '@/shared/ui/input/Textarea';
import type { MatterNote } from '@/features/matters/data/mockMatters';

export type NoteFormValues = {
  content: string;
};

interface NoteFormProps {
  initialNote?: MatterNote;
  onSubmit: (values: NoteFormValues) => void;
  onCancel: () => void;
  onDelete?: () => void;
}

export const NoteForm = ({ initialNote, onSubmit, onCancel, onDelete }: NoteFormProps) => {
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
      <Textarea
        label="Content"
        value={content}
        onChange={(value) => {
          setContent(value);
          if (error && value.trim()) {
            setError('');
          }
        }}
        rows={5}
        required
        error={error}
        placeholder="Capture key updates, decisions, or follow-ups for this matter."
      />
      <div className="flex flex-wrap items-center justify-end gap-3">
        {onDelete && (
          <Button type="button" variant="secondary" onClick={onDelete}>
            Delete note
          </Button>
        )}
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">{initialNote ? 'Update note' : 'Create note'}</Button>
      </div>
    </form>
  );
};
