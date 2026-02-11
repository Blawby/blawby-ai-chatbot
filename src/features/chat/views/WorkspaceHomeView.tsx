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
  const resolvedConsultationCta = consultationCta ?? t('workspace.home.consultation.button');
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
    <div className="relative flex flex-1 flex-col rounded-none border-0 bg-light-bg shadow-none dark:bg-dark-bg">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[360px] bg-gradient-to-b from-primary-700/95 via-primary-800/80 to-transparent dark:from-primary-800/95 dark:via-primary-900/70"
        aria-hidden="true"
      />
      <div className="pointer-events-none absolute -left-16 top-8 h-48 w-48 rounded-full bg-accent-500/30 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -right-10 top-24 h-36 w-36 rounded-full bg-white/12 blur-3xl" aria-hidden="true" />

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
            className="rounded-2xl border border-light-border bg-light-card-bg px-4 py-4 text-left shadow-[0_16px_32px_rgba(15,23,42,0.12)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70 dark:border-dark-border dark:bg-dark-card-bg"
            aria-label={t('workspace.home.recentMessage')}
          >
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
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
                <div className="flex items-center justify-between gap-3 text-sm font-semibold text-gray-900 dark:text-gray-100">
                  <span className="truncate">{recentMessage.senderLabel}</span>
                  {recentMessage.timestampLabel && (
                    <span className="text-xs font-normal text-gray-500 dark:text-gray-400">
                      {recentMessage.timestampLabel}
                    </span>
                  )}
                </div>
                <div className="mt-1 truncate text-sm text-gray-600 dark:text-gray-300">
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
          className="group flex w-full items-center justify-between rounded-2xl border border-light-border bg-light-card-bg px-5 py-4 text-left text-gray-900 shadow-[0_16px_32px_rgba(15,23,42,0.12)] transition duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70 dark:border-dark-border dark:bg-dark-card-bg dark:text-gray-100"
          aria-label={t('workspace.home.sendMessage')}
        >
          <span className="text-base font-semibold">{t('workspace.home.sendMessage')}</span>
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-500 text-gray-900 shadow-sm transition group-hover:scale-[1.02] group-hover:bg-accent-600">
            <PaperAirplaneIcon className="h-4 w-4" aria-hidden="true" />
          </span>
        </button>

        <div className="rounded-3xl border border-light-border bg-light-card-bg px-5 py-6 shadow-[0_20px_48px_rgba(15,23,42,0.12)] dark:border-dark-border dark:bg-dark-card-bg">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">{resolvedConsultationTitle}</h3>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
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
          <div className="mt-4 text-center text-xs font-medium text-gray-400 dark:text-gray-500">
            {t('workspace.home.poweredBy')} {poweredByLink}
          </div>
        </div>
      </section>
    </div>
  );
};

export default WorkspaceHomeView;
