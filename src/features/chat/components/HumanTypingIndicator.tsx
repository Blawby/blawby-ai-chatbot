import type { VNode } from 'preact';
import { MessageAvatar } from './MessageAvatar';

export interface TypingParticipant {
  userId: string;
  name: string;
  image?: string | null;
}

interface HumanTypingIndicatorProps {
  participants: readonly TypingParticipant[];
  className?: string;
}

const buildLabel = (participants: readonly TypingParticipant[]): string => {
  if (participants.length === 1) return `${participants[0].name} is typing`;
  if (participants.length === 2) return `${participants[0].name} and ${participants[1].name} are typing`;
  return `${participants[0].name} and ${participants.length - 1} others are typing`;
};

export const HumanTypingIndicator = ({
  participants,
  className = '',
}: HumanTypingIndicatorProps): VNode | null => {
  if (participants.length === 0) return null;
  const label = buildLabel(participants);
  const lead = participants[0];

  return (
    <div
      className={`flex items-center gap-2 px-4 py-2 ${className}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <MessageAvatar src={lead.image ?? null} name={lead.name} size="xs" />
      <span className="ai-thinking-indicator__dot" aria-hidden="true" />
      <span className="text-xs text-input-placeholder">{label}…</span>
    </div>
  );
};
