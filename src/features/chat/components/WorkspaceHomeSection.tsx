import type { FunctionComponent } from 'preact';
import WorkspaceHomeView from '@/features/chat/views/WorkspaceHomeView';
import { ClientDashboard } from '@/features/client-dashboard/ClientDashboard';

type RecentMessage = {
  preview: string;
  timestampLabel: string;
  senderLabel: string;
  avatarSrc: string | null;
  conversationId: string | null;
} | null;

type WorkspaceHomeSectionProps = {
  workspace: 'public' | 'practice' | 'client';
  practiceId?: string | null;
  practiceSlug?: string | null;
  practiceName?: string | null;
  practiceLogo?: string | null;
  recentMessage: RecentMessage;
  intakeContactStarted: boolean;
  onOpenRecentMessage: () => void;
  onSendMessage: () => void;
  onRequestConsultation: () => void;
};

export const WorkspaceHomeSection: FunctionComponent<WorkspaceHomeSectionProps> = ({
  workspace,
  practiceId,
  practiceSlug,
  practiceName,
  practiceLogo,
  recentMessage,
  intakeContactStarted,
  onOpenRecentMessage,
  onSendMessage,
  onRequestConsultation,
}) => {
  if (workspace === 'client') {
    return (
      <ClientDashboard
        practiceId={practiceId ?? null}
        practiceSlug={practiceSlug ?? null}
        practiceName={practiceName}
        practiceLogo={practiceLogo}
        onSendMessage={onSendMessage}
      />
    );
  }

  return (
    <WorkspaceHomeView
      practiceName={practiceName}
      practiceLogo={practiceLogo}
      onSendMessage={onSendMessage}
      onRequestConsultation={onRequestConsultation}
      recentMessage={recentMessage}
      onOpenRecentMessage={onOpenRecentMessage}
      consultationTitle={undefined}
      consultationDescription={undefined}
      consultationCta={undefined}
      showConsultationCard={!intakeContactStarted}
    />
  );
};
