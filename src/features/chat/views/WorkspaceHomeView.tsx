import { FunctionComponent } from 'preact';
import { useTranslation } from 'react-i18next';
import { PaperAirplaneIcon } from '@heroicons/react/24/outline';
import { Avatar } from '@/shared/ui/profile/atoms/Avatar';
import { Button } from '@/shared/ui/Button';

interface WorkspaceHomeViewProps {
  practiceName?: string | null;
  practiceLogo?: string | null;
  onSendMessage?: () => void;
  onRequestConsultation?: () => void;
  onOpenRecentMessage?: () => void;
  recentMessage?: {
    preview: string;
    timestampLabel: string;
    senderLabel: string;
    avatarSrc?: string | null;
    conversationId?: string | null;
  } | null;
  consultationTitle?: string;
  consultationDescription?: string;
  consultationCta?: string;
}

const WorkspaceHomeView: FunctionComponent<WorkspaceHomeViewProps> = ({
  practiceName,
  practiceLogo,
  onSendMessage,
  onRequestConsultation,
  onOpenRecentMessage,
  recentMessage,
  consultationTitle,
  consultationDescription,
  consultationCta
}) => {
  const { t } = useTranslation();
  const resolvedName = typeof practiceName === 'string'
    ? practiceName.trim()
    : '';
  const resolvedConsultationTitle = consultationTitle ?? t('workspace.home.consultation.title');
  const resolvedConsultationDescription = consultationDescription ?? t('workspace.home.consultation.description');
  const resolvedConsultationCta = consultationCta ?? t('chat.requestConsultation');
  const canSendMessage = Boolean(onSendMessage);
  const canRequestConsultation = Boolean(onRequestConsultation);
  const canOpenRecentMessage = Boolean(onOpenRecentMessage);
  const poweredByLink = (
    <a
      href="https://blawby.com"
      target="_blank"
      rel="noopener noreferrer"
    >
      Blawby
    </a>
  );

  return (
    <div className="relative flex flex-1 flex-col rounded-none border-0 bg-transparent shadow-none">
      <section className="relative z-10 px-6 pb-12 pt-8 text-white">
        <div className="flex items-center gap-3">
          <Avatar
            src={practiceLogo}
            name={resolvedName}
            size="lg"
            className="ring-2 ring-white/30"
          />
          <div className="text-lg font-semibold tracking-wide text-white">{resolvedName}</div>
        </div>

        <div className="mt-20 mb-8 space-y-1 text-3xl font-semibold leading-tight">
          <div className="animate-float-in">{t('workspace.home.greeting')}</div>
          <div className="animate-float-in [animation-delay:120ms]">{t('workspace.home.helpPrompt')}</div>
        </div>
      </section>

      <section className="relative z-10 flex flex-col gap-4 px-6 pb-10 -mt-10">
        {recentMessage && (
          <button
            type="button"
            onClick={onOpenRecentMessage}
            disabled={!canOpenRecentMessage}
            className="glass-card px-5 py-5 text-left transition-all duration-300 hover:scale-[1.01] hover:bg-white/10 hover:shadow-xl active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70"
            aria-label={t('workspace.home.recentMessage')}
          >
            <div className="text-xs font-semibold uppercase tracking-wide text-input-placeholder">
              {t('workspace.home.recentMessage')}
            </div>
            <div className="mt-3 flex items-center gap-3">
              <Avatar
                src={recentMessage.avatarSrc ?? null}
                name={recentMessage.senderLabel}
                size="md"
                className="ring-2 ring-white/10"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3 text-sm font-semibold text-input-text">
                  <span className="truncate">{recentMessage.senderLabel}</span>
                  {recentMessage.timestampLabel && (
                    <span className="text-xs font-normal text-input-placeholder">
                      {recentMessage.timestampLabel}
                    </span>
                  )}
                </div>
                <div className="mt-1 truncate text-sm text-input-placeholder">
                  {recentMessage.preview}
                </div>
              </div>
            </div>
          </button>
        )}

        <button
          type="button"
          onClick={onSendMessage}
          disabled={!canSendMessage}
          className="group relative overflow-hidden glass-card flex w-full items-center justify-between px-6 py-5 text-left text-input-text transition-all duration-300 hover:scale-[1.01] hover:shadow-xl active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70"
          aria-label={t('workspace.home.sendMessage')}
        >
          <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-accent-500/50 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
          <span className="text-lg font-bold tracking-tight">{t('workspace.home.sendMessage')}</span>
          <span
            className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-accent-500 text-gray-900 pointer-events-none transition-all duration-300 group-hover:scale-110 group-hover:shadow-accent-500/40"
            aria-hidden="true"
          >
            <PaperAirplaneIcon className="h-5 w-5" aria-hidden="true" />
          </span>
        </button>

        <div className="glass-card px-5 py-6">
          <h3 className="text-base font-semibold text-input-text">{resolvedConsultationTitle}</h3>
          <p className="mt-2 text-sm text-input-placeholder">
            {resolvedConsultationDescription}
          </p>
          <div className="mt-4">
            <Button
              type="button"
              variant="primary"
              size="lg"
              className="w-full"
              onClick={onRequestConsultation}
              disabled={!canRequestConsultation}
            >
              {resolvedConsultationCta}
            </Button>
          </div>
          <div className="mt-4 text-center text-xs font-medium text-input-placeholder">
            {t('workspace.home.poweredBy')} {poweredByLink}
          </div>
        </div>
      </section>
    </div>
  );
};

export default WorkspaceHomeView;
