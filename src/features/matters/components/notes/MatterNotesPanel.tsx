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
}

export const MatterNotesPanel = ({ matter }: MatterNotesPanelProps) => {
  const [notes, setNotes] = useState<MatterNote[]>(() => matter.notes ?? []);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<MatterNote | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MatterNote | null>(null);
  const [formKey, setFormKey] = useState(0);

  const sortedNotes = useMemo(() => {
    return [...notes].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [notes]);

  const openNewNote = () => {
    setEditingNote(null);
    setFormKey((prev) => prev + 1);
    setIsFormOpen(true);
  };

  const openEditNote = (note: MatterNote) => {
    setEditingNote(note);
    setFormKey((prev) => prev + 1);
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingNote(null);
  };

  const handleSave = ({ content }: NoteFormValues) => {
    const now = new Date().toISOString();
    const nextNote: MatterNote = {
      id: editingNote?.id ?? ulid(),
      author: editingNote?.author ?? defaultAuthor,
      content,
      createdAt: editingNote?.createdAt ?? now,
      updatedAt: editingNote ? now : undefined
    };

    setNotes((prev) => (
      editingNote
        ? prev.map((note) => (note.id === editingNote.id ? nextNote : note))
        : [nextNote, ...prev]
    ));

    closeForm();
  };

  const confirmDelete = (note: MatterNote) => {
    setDeleteTarget(note);
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    setNotes((prev) => prev.filter((note) => note.id !== deleteTarget.id));
    setDeleteTarget(null);
    if (editingNote?.id === deleteTarget.id) {
      closeForm();
    }
  };

  return (
    <section className="rounded-2xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card-bg">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 dark:border-white/10 px-6 py-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Notes</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {sortedNotes.length} notes recorded
          </p>
        </div>
        <Button size="sm" icon={<PlusIcon className="h-4 w-4" />} onClick={openNewNote}>
          Add note
        </Button>
      </header>

      {sortedNotes.length === 0 ? (
        <div className="px-6 py-6 text-sm text-gray-500 dark:text-gray-400">
          No notes yet. Capture internal updates, decisions, or next steps tied to this matter.
        </div>
      ) : (
        <ul className="divide-y divide-gray-200 dark:divide-white/10">
          {sortedNotes.map((note) => (
            <li key={note.id} className="flex flex-col gap-4 px-6 py-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 gap-3">
                <Avatar name={note.author.name} src={note.author.avatarUrl} size="sm" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">
                      {note.author.name}
                    </p>
                    {note.author.role && (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-white/10 dark:text-gray-300">
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
              </div>
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
                      <DropdownMenuItem onSelect={() => openEditNote(note)}>
                        <span className="flex items-center gap-2">
                          <PencilIcon className="h-4 w-4" />
                          Edit
                        </span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => confirmDelete(note)}>
                        <span className="flex items-center gap-2 text-red-600 dark:text-red-400">
                          <TrashIcon className="h-4 w-4" />
                          Delete
                        </span>
                      </DropdownMenuItem>
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
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
            onDelete={editingNote ? () => confirmDelete(editingNote) : undefined}
          />
        </Modal>
      )}

      {deleteTarget && (
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
            <div className="flex items-center justify-end gap-3">
              <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
                Cancel
              </Button>
              <Button onClick={handleDelete}>Delete note</Button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
};
