import { FileText } from 'lucide-preact';

import { LoadingBlock } from '@/shared/ui/layout';
import { InfoCard } from '@/shared/ui/cards/InfoCard';
import {
  ActivityTimeline,
  type TimelineItem,
  type TimelinePerson
} from '@/shared/ui/activity/ActivityTimeline';

export interface MatterNotesTabProps {
  noteItems: TimelineItem[];
  noteLoading: boolean;
  noteError: string | null;
  onNoteRetry: () => void;
  onCreateNote: (content: string) => Promise<void>;
  composerPerson: TimelinePerson;
  composerPracticeId: string | null;
}

export const MatterNotesTab = ({
  noteItems,
  noteLoading,
  noteError,
  onNoteRetry,
  onCreateNote,
  composerPerson,
  composerPracticeId
}: MatterNotesTabProps) => (
  <InfoCard icon={FileText} title="Notes">
    {noteLoading && noteItems.length === 0 ? (
      <LoadingBlock label="Loading notes" />
    ) : noteError && noteItems.length === 0 ? (
      <p className="text-sm text-input-placeholder">
        Could not load notes.{' '}
        <button type="button" className="underline" onClick={onNoteRetry}>
          Retry
        </button>
      </p>
    ) : (
      <ActivityTimeline
        items={noteItems}
        showComposer
        composerDisabled={noteLoading}
        composerLabel="Note"
        composerPlaceholder="Add a note..."
        composerPracticeId={composerPracticeId}
        composerPerson={composerPerson}
        onComposerSubmit={async (value) => {
          await onCreateNote(value);
        }}
      />
    )}
  </InfoCard>
);
