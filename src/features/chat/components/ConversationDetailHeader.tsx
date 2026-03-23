import { FunctionComponent } from 'preact';
import { useMemo } from 'preact/hooks';
import { InformationCircleIcon } from '@heroicons/react/24/outline';
import { Button } from '@/shared/ui/Button';
import { Icon } from '@/shared/ui/Icon';
import WorkspaceConversationHeader from './WorkspaceConversationHeader';
import { resolveStrengthStyle, resolveStrengthTier } from '@/shared/utils/intakeStrength';
import { useTranslation } from '@/shared/i18n/hooks';
import { formatRelativeTime } from '@/features/matters/utils/formatRelativeTime';
import type { ChatMessageUI } from '../../../../worker/types';
import type { ConversationMode } from '@/shared/types/conversation';
import type { IntakeConversationState } from '@/shared/types/intake';

interface ConversationDetailHeaderProps {
  practiceName?: string | null;
  messages: ChatMessageUI[];
  isSocketReady?: boolean;
  conversationMode?: ConversationMode | null;
  intakeConversationState?: IntakeConversationState | null;
  onBack?: () => void;
  onOpenInspector?: () => void;
}

const ConversationDetailHeader: FunctionComponent<ConversationDetailHeaderProps> = ({
  practiceName,
  messages,
  isSocketReady,
  conversationMode,
  intakeConversationState,
  onBack,
  onOpenInspector,
}) => {
  const { t } = useTranslation();

  const filteredMessagesForHeader = useMemo(() => {
    const base = messages.filter((message) => message.metadata?.systemMessageKey !== 'ask_question_help');
    const hasNonSystem = base.some((message) => message.role !== 'system');
    return hasNonSystem ? base.filter((message) => message.metadata?.systemMessageKey !== 'intro') : base;
  }, [messages]);

  const activeLabel = useMemo(() => {
    if (isSocketReady) return t('workspace.header.activeNow');
    const lastTimestamp = [...filteredMessagesForHeader].reverse().find((message) => typeof message.timestamp === 'number')?.timestamp;
    if (!lastTimestamp) return t('workspace.header.inactive');
    const relative = formatRelativeTime(new Date(lastTimestamp));
    return relative ? t('workspace.header.activeRelative', { time: relative }) : t('workspace.header.inactive');
  }, [filteredMessagesForHeader, isSocketReady, t]);

  const rightSlot = useMemo(() => {
    if (!onOpenInspector) return null;

    let buttonContent = <Icon icon={InformationCircleIcon} className="h-5 w-5" />;

    if (conversationMode === 'REQUEST_CONSULTATION' && intakeConversationState) {
      const tier = resolveStrengthTier(intakeConversationState);
      const { percent, ringClass } = resolveStrengthStyle(tier);
      const radius = 9;
      const circumference = 2 * Math.PI * radius;
      const dashOffset = circumference - (percent / 100) * circumference;

      buttonContent = (
        <span className="relative flex h-6 w-6 items-center justify-center">
          <svg className="-rotate-90 absolute inset-0 h-6 w-6" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r={radius} strokeWidth="2" fill="none" className="text-line-glass/30" stroke="currentColor" />
            <circle
              cx="12"
              cy="12"
              r={radius}
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
              className={`transition-all duration-300 ${ringClass}`}
              stroke="currentColor"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
            />
          </svg>
          <Icon icon={InformationCircleIcon} className="relative z-10 h-3.5 w-3.5" aria-hidden="true" />
        </span>
      );
    }

    return (
      <Button
        type="button"
        variant="icon"
        size="icon-sm"
        onClick={onOpenInspector}
        aria-label={t('conversation.openInspector')}
      >
        {buttonContent}
      </Button>
    );
  }, [conversationMode, intakeConversationState, onOpenInspector]);

  return (
    <WorkspaceConversationHeader
      practiceName={practiceName}
      activeLabel={activeLabel}
      onBack={onBack}
      rightSlot={rightSlot}
    />
  );
};

export default ConversationDetailHeader;
