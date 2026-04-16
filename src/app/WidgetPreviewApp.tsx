import { FunctionComponent } from 'preact';
import { useMemo } from 'preact/hooks';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { ChatActionCard } from '@/features/chat/components/ChatActionCard';
import ChatContainer from '@/features/chat/components/ChatContainer';
import WorkspaceHomeView from '@/features/chat/views/WorkspaceHomeView';
import { Button } from '@/shared/ui/Button';
import { DetailHeader } from '@/shared/ui/layout/DetailHeader';
import type { UIPracticeConfig } from '@/shared/hooks/usePracticeConfig';
import type { WidgetPreviewConfig, WidgetPreviewScenario } from '@/shared/types/widgetPreview';
import type { ChatMessageUI, FileAttachment } from '../../worker/types';
import type { MinorAmount } from '@/shared/utils/money';

type WidgetPreviewAppProps = {
  practiceId: string;
  practiceConfig: UIPracticeConfig;
  scenario: WidgetPreviewScenario;
  previewConfig: WidgetPreviewConfig;
};

const noop = () => {};
const noopAsync = async () => {};

const emptyFiles: FileAttachment[] = [];

const assistantMessage = (id: string, content: string, metadata?: Record<string, unknown>): ChatMessageUI => ({
  id,
  role: 'assistant',
  content,
  timestamp: Date.now(),
  reply_to_message_id: null,
  metadata: metadata ?? { source: 'preview' },
  isUser: false,
});

export const WidgetPreviewApp: FunctionComponent<WidgetPreviewAppProps> = ({
  practiceId,
  practiceConfig,
  scenario,
  previewConfig,
}) => {
  const practiceName = practiceConfig.name || 'Blawby Messenger';
  const practiceLogo = practiceConfig.profileImage ?? null;
  const introMessage = previewConfig.introMessage?.trim() || practiceConfig.introMessage?.trim() || '';
  const legalDisclaimer = previewConfig.legalDisclaimer?.trim() || practiceConfig.legalDisclaimer?.trim() || '';
  const services = useMemo(() => previewConfig.services ?? [], [previewConfig.services]);
  const consultationFee = typeof previewConfig.consultationFee === 'number'
    ? previewConfig.consultationFee
    : typeof practiceConfig.consultationFee === 'number'
      ? practiceConfig.consultationFee
      : null;
  const paymentLinkEnabled = Boolean(previewConfig.paymentLinkEnabled);
  const currency = previewConfig.currency || 'USD';

  const header = (subtitle: string) => (
    <DetailHeader
      title={practiceName}
      subtitle={subtitle}
      className="workspace-conversation-header"
      actions={(
        <Button
          type="button"
          variant="icon"
          size="icon-sm"
          aria-label="Close preview"
          icon={XMarkIcon}
          iconClassName="h-5 w-5"
          onClick={noop}
        />
      )}
    />
  );

  const messages = useMemo<ChatMessageUI[]>(() => {
    if (scenario === 'consultation-payment') {
      return [
        assistantMessage(
          'preview-payment-ready',
          paymentLinkEnabled
            ? 'Your consultation request is ready. Complete the consultation fee to send it to the practice.'
            : 'Your consultation request is ready to submit.'
        ),
        {
          ...assistantMessage(
            'preview-payment-card',
            paymentLinkEnabled
              ? 'Use the payment button below to continue.'
              : 'No consultation fee is configured for this preview.'
          ),
          paymentRequest: paymentLinkEnabled && consultationFee
            ? {
              amount: consultationFee as MinorAmount,
              currency,
              practiceName,
              practiceLogo: practiceLogo ?? undefined,
              paymentLinkUrl: '#preview-payment',
              intakeUuid: 'preview',
              conversationId: 'preview',
              practiceId,
            }
            : undefined,
        },
      ];
    }

    if (scenario === 'service-routing') {
      const serviceList = services.length > 0
        ? services.slice(0, 5).map((service) => service.name).join(', ')
        : 'your configured services';
      return [
        assistantMessage(
          'preview-services-intro',
          `Tell me what is going on in your own words. I will use ${serviceList} to help route your request.`
        ),
      ];
    }

    return introMessage
      ? [assistantMessage('preview-intro', introMessage, { source: 'practice_intro', systemMessageKey: 'intro' })]
      : [
        assistantMessage(
          'preview-empty-intro',
          'Add an opening message to preview the first assistant message.'
        ),
      ];
  }, [
    consultationFee,
    currency,
    introMessage,
    paymentLinkEnabled,
    practiceId,
    practiceLogo,
    practiceName,
    scenario,
    services,
  ]);

  if (scenario === 'messenger-start' && legalDisclaimer) {
    return (
      <div className="absolute inset-0 flex h-[100dvh] w-full flex-col overflow-hidden widget-shell-gradient">
        {header('Please read and accept to continue')}
        <div className="flex-1 min-h-0" />
        <div className="sticky bottom-0 z-[1000] w-full">
          <ChatActionCard
            isOpen={true}
            type="disclaimer"
            onClose={noop}
            disclaimerProps={{
              text: legalDisclaimer,
              onAccept: noop,
              isSubmitting: false,
            }}
          />
        </div>
      </div>
    );
  }

  if (scenario === 'messenger-start' && !introMessage && !legalDisclaimer) {
    return (
      <div className="absolute inset-0 h-[100dvh] w-full overflow-hidden widget-shell-gradient">
        <WorkspaceHomeView
          practiceName={practiceName}
          practiceLogo={practiceLogo}
          onSendMessage={noop}
          onRequestConsultation={noop}
          onOpenRecentMessage={noop}
          recentMessage={null}
        />
      </div>
    );
  }

  return (
    <div className="absolute inset-0 flex h-[100dvh] w-full flex-col overflow-hidden widget-shell-gradient">
      <ChatContainer
        messages={messages}
        conversationTitle="Preview"
        onSendMessage={noop}
        composerDisabled
        isPublicWorkspace
        messagesReady
        headerContent={header(
          scenario === 'consultation-payment'
            ? 'Consultation request'
            : scenario === 'service-routing'
              ? 'Service routing'
              : 'Opening message'
        )}
        heightClassName="h-full"
        useFrame={false}
        layoutMode="widget"
        practiceConfig={{
          ...practiceConfig,
          name: practiceName,
          profileImage: practiceLogo,
          practiceId,
        }}
        practiceId={practiceId}
        intakeStatus={scenario === 'consultation-payment' ? {
          step: paymentLinkEnabled ? 'payment_required' : 'ready_to_submit',
          intakeUuid: 'preview',
          paymentRequired: paymentLinkEnabled,
          paymentReceived: false,
        } : undefined}
        previewFiles={emptyFiles}
        uploadingFiles={[]}
        removePreviewFile={noop}
        clearPreviewFiles={noop}
        handleCameraCapture={noopAsync}
        handleFileSelect={noopAsync}
        handleMediaCapture={noop}
        cancelUpload={noop}
        isRecording={false}
        setIsRecording={noop}
        isReadyToUpload={false}
        isSessionReady
        isSocketReady
        canChat
        hasMoreMessages={false}
        isLoadingMoreMessages={false}
        onLoadMoreMessages={noopAsync}
      />
    </div>
  );
};
