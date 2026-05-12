import type { VNode } from 'preact';
import { StackedAvatars } from '@/shared/ui/profile/molecules/StackedAvatars';

export interface ReadReceiptReader {
  id: string;
  name: string;
  image?: string | null;
}

interface MessageReadReceiptsProps {
  readers: readonly ReadReceiptReader[];
  className?: string;
}

export const MessageReadReceipts = ({
  readers,
  className = '',
}: MessageReadReceiptsProps): VNode | null => {
  if (readers.length === 0) return null;
  const single = readers[0];
  const label = readers.length === 1
    ? `Seen by ${single.name}`
    : `Seen by ${readers.length} people`;

  return (
    <div
      className={`mt-1 flex items-center justify-end gap-1.5 ${className}`}
      aria-label={label}
    >
      <StackedAvatars
        users={readers.map((r) => ({ id: r.id, name: r.name, image: r.image ?? null }))}
        size="sm"
        max={3}
        showOverflow
      />
    </div>
  );
};
