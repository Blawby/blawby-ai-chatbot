import { FunctionComponent } from 'preact';
import { PaperAirplaneIcon } from '@heroicons/react/24/outline';
import { Avatar } from '@/shared/ui/profile/atoms/Avatar';
import { Button } from '@/shared/ui/Button';

interface PublicEmbedHomeProps {
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
}

const PublicEmbedHome: FunctionComponent<PublicEmbedHomeProps> = ({
  practiceName,
  practiceLogo,
  onSendMessage,
  onRequestConsultation,
  onOpenRecentMessage,
  recentMessage
}) => {
  const resolvedName = typeof practiceName === 'string'
    ? practiceName.trim()
    : '';
  const canSendMessage = Boolean(onSendMessage);
  const canRequestConsultation = Boolean(onRequestConsultation);
  const poweredByLink = (
    <a
      href="https://blawby.com"
      target="_blank"
      rel="noreferrer"
    >
      Blawby
    </a>
  );

  return (
    <div className="relative flex flex-1 flex-col overflow-y-auto bg-light-bg dark:bg-dark-bg">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[340px] bg-gradient-to-b from-primary-700 via-primary-800/90 to-transparent dark:from-primary-900 dark:via-primary-950/90"
        aria-hidden="true"
      />
      <div className="pointer-events-none absolute -left-12 top-10 h-40 w-40 rounded-full bg-accent-500/20 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -right-12 top-24 h-32 w-32 rounded-full bg-white/10 blur-3xl" aria-hidden="true" />

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

        <div className="mt-16 mb-6 space-y-1 text-3xl font-semibold leading-tight">
          <div className="animate-float-in">Hi there 👋</div>
          <div className="animate-float-in [animation-delay:120ms]">How can we help?</div>
        </div>
      </section>

      <section className="relative z-10 flex flex-col gap-4 px-6 pb-10 -mt-10">
        {recentMessage && (
          <button
            type="button"
            onClick={onOpenRecentMessage}
            className="rounded-2xl border border-light-border bg-light-card-bg px-4 py-4 text-left shadow-[0_16px_32px_rgba(15,23,42,0.12)] transition hover:-translate-y-0.5 dark:border-dark-border dark:bg-dark-card-bg"
            aria-label="Open recent message"
          >
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Recent message
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
          aria-label="Send us a message"
        >
          <span className="text-base font-semibold">Send us a message</span>
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-500 text-gray-900 shadow-sm transition group-hover:scale-[1.02] group-hover:bg-accent-600">
            <PaperAirplaneIcon className="h-4 w-4" aria-hidden="true" />
          </span>
        </button>

        <div className="rounded-3xl border border-light-border bg-light-card-bg px-5 py-6 shadow-[0_20px_48px_rgba(15,23,42,0.12)] dark:border-dark-border dark:bg-dark-card-bg">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Need to speak to a lawyer?</h3>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
            Share a few details and we will connect you with the right attorney for your situation.
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
              Request Consultation
            </Button>
          </div>
          <div className="mt-4 text-center text-xs font-medium text-gray-400 dark:text-gray-500">
            Powered by {poweredByLink}
          </div>
        </div>
      </section>
    </div>
  );
};

export default PublicEmbedHome;
