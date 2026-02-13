import { useMemo, useState } from 'preact/hooks';
import { EllipsisVerticalIcon, PencilIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import { format, parseISO } from 'date-fns';
import { ulid } from 'ulid';
import Modal from '@/shared/components/Modal';
import { Button } from '@/shared/ui/Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/shared/ui/dropdown';
import { Avatar } from '@/shared/ui/profile';
import type { MatterDetail, MatterNote } from '@/features/matters/data/mockMatters';
import { NoteForm, type NoteFormValues } from './NoteForm';

const formatNoteDate = (dateString: string) => format(parseISO(dateString), 'MMM d, yyyy h:mm a');

const defaultAuthor: MatterNote['author'] = {
  name: 'You',
  role: 'Case Manager'
};

interface MatterNotesPanelProps {
  matter: MatterDetail;
  notes?: MatterNote[];
  loading?: boolean;
  error?: string | null;
  onCreateNote?: (values: NoteFormValues) => Promise<void> | void;
  onUpdateNote?: (note: MatterNote, values: NoteFormValues) => Promise<void> | void;
  onDeleteNote?: (note: MatterNote) => Promise<void> | void;
  allowEdit?: boolean;
}

export const MatterNotesPanel = ({
  matter,
  notes,
  loading = false,
  error = null,
  onCreateNote,
  onUpdateNote,
  onDeleteNote,
  allowEdit = true
}: MatterNotesPanelProps) => {
  const [localNotes, setLocalNotes] = useState<MatterNote[]>(() => matter.notes ?? []);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<MatterNote | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MatterNote | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resolvedNotes = notes ?? localNotes;
  const canEdit = allowEdit && (Boolean(onUpdateNote) || (notes === undefined && !onCreateNote));
  const canDelete = allowEdit && (Boolean(onDeleteNote) || (notes === undefined && !onCreateNote));
  const canCreate = Boolean(onCreateNote) || notes === undefined;

  const sortedNotes = useMemo(() => {
    return [...resolvedNotes].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [resolvedNotes]);

  const openNewNote = () => {
    if (!canCreate) return;
    setEditingNote(null);
    setFormKey((prev) => prev + 1);
    setIsFormOpen(true);
  };

  const openEditNote = (note: MatterNote) => {
    if (!canEdit) return;
    setEditingNote(note);
    setFormKey((prev) => prev + 1);
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingNote(null);
  };

  const handleSave = async ({ content }: NoteFormValues) => {
    setSubmitError(null);
    if (editingNote && onUpdateNote) {
      setIsSubmitting(true);
      try {
        await onUpdateNote(editingNote, { content });
        closeForm();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to update note';
        setSubmitError(message);
      } finally {
        setIsSubmitting(false);
      }
      return;
    }
    if (onCreateNote && !editingNote) {
      setIsSubmitting(true);
      try {
        await onCreateNote({ content });
        closeForm();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to save note';
        setSubmitError(message);
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    const now = new Date().toISOString();
    const nextNote: MatterNote = {
      id: editingNote?.id ?? ulid(),
      author: editingNote?.author ?? defaultAuthor,
      content,
      createdAt: editingNote?.createdAt ?? now,
      updatedAt: editingNote ? now : undefined
    };

    setLocalNotes((prev) => (
      editingNote
        ? prev.map((note) => (note.id === editingNote.id ? nextNote : note))
        : [nextNote, ...prev]
    ));

    closeForm();
  };

  const confirmDelete = (note: MatterNote) => {
    if (!canDelete) return;
    setDeleteTarget(note);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteError(null);
    if (onDeleteNote) {
      setIsSubmitting(true);
      try {
        await onDeleteNote(deleteTarget);
        setDeleteTarget(null);
        if (editingNote?.id === deleteTarget.id) {
          closeForm();
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to delete note';
        setDeleteError(message);
      } finally {
        setIsSubmitting(false);
      }
      return;
    }
    setLocalNotes((prev) => prev.filter((note) => note.id !== deleteTarget.id));
    setDeleteTarget(null);
    if (editingNote?.id === deleteTarget.id) {
      closeForm();
    }
  };

  return (
    <section className="glass-panel">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line-glass/30 px-6 py-4">
        <div>
          <h3 className="text-sm font-semibold text-input-text">Notes</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {sortedNotes.length} notes recorded
          </p>
        </div>
        <Button size="sm" icon={<PlusIcon className="h-4 w-4" />} onClick={openNewNote} disabled={!canCreate}>
          Add note
        </Button>
      </header>

      {error ? (
        <div className="px-6 py-6 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      ) : loading && sortedNotes.length === 0 ? (
        <div className="px-6 py-6 text-sm text-gray-500 dark:text-gray-400">
          Loading notes...
        </div>
      ) : sortedNotes.length === 0 ? (
        <div className="px-6 py-6 text-sm text-gray-500 dark:text-gray-400">
          No notes yet. Capture internal updates, decisions, or next steps tied to this matter.
        </div>
      ) : (
        <ul className="divide-y divide-line-default">
          {sortedNotes.map((note) => (
            <li
              key={note.id}
              className="flex flex-col gap-4 px-6 py-4 sm:flex-row sm:items-start sm:justify-between hover:bg-surface-glass/50 transition-colors"
            >
              <button
                type="button"
                className="flex min-w-0 gap-3 text-left flex-1"
                onClick={() => openEditNote(note)}
                disabled={!canEdit}
              >
                <Avatar name={note.author.name} src={note.author.avatarUrl} size="sm" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-input-text">
                      {note.author.name}
                    </p>
                    {note.author.role && (
                      <span className="rounded-full bg-surface-glass/60 px-2 py-0.5 text-xs font-medium text-input-placeholder">
                        {note.author.role}
                      </span>
                    )}
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {formatNoteDate(note.updatedAt ?? note.createdAt)}
                    </span>
                    {note.updatedAt && (
                      <span className="text-xs text-gray-400">(edited)</span>
                    )}
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-gray-600 dark:text-gray-300">
                    {note.content}
                  </p>
                </div>
              </button>
              {canEdit || canDelete ? (
                <div className="flex items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="Open note actions"
                      icon={<EllipsisVerticalIcon className="h-4 w-4" />}
                    />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-32">
                    <div className="py-1">
                      {canEdit ? (
                        <DropdownMenuItem onSelect={() => openEditNote(note)}>
                          <span className="flex items-center gap-2">
                            <PencilIcon className="h-4 w-4" />
                            Edit
                          </span>
                        </DropdownMenuItem>
                      ) : null}
                      {canDelete ? (
                        <DropdownMenuItem onSelect={() => confirmDelete(note)}>
                          <span className="flex items-center gap-2 text-red-600 dark:text-red-400">
                            <TrashIcon className="h-4 w-4" />
                            Delete
                          </span>
                        </DropdownMenuItem>
                      ) : null}
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {isFormOpen && (
        <Modal
          isOpen={isFormOpen}
          onClose={closeForm}
          title={editingNote ? 'Edit note' : 'Add note'}
          contentClassName="max-w-2xl"
        >
          <NoteForm
            key={`${editingNote?.id ?? 'new'}-${formKey}`}
            initialNote={editingNote ?? undefined}
            onSubmit={handleSave}
            onCancel={closeForm}
            onDelete={canDelete && editingNote ? () => confirmDelete(editingNote) : undefined}
            isSubmitting={isSubmitting}
          />
          {submitError && (
            <p className="mt-3 text-sm text-red-600 dark:text-red-400">{submitError}</p>
          )}
          {isSubmitting && (
            <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">Saving note...</p>
          )}
        </Modal>
      )}

      {canDelete && deleteTarget && (
        <Modal
          isOpen={Boolean(deleteTarget)}
          onClose={() => setDeleteTarget(null)}
          title="Delete note"
          contentClassName="max-w-xl"
        >
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Are you sure you want to delete this note? This action cannot be undone.
            </p>
            {deleteError && (
              <p className="text-sm text-red-600 dark:text-red-400">{deleteError}</p>
            )}
            <div className="flex items-center justify-end gap-3">
              <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={handleDelete} disabled={isSubmitting}>
                {isSubmitting ? 'Deleting...' : 'Delete note'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
};
