import { FunctionComponent } from 'preact';
import { useMemo, useState } from 'preact/hooks';
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

const getIntakePreviewQuestion = (field: NonNullable<WidgetPreviewConfig['intakeTemplate']>['fields'][number]) => {
  const explicitQuestion = field.previewQuestion?.trim();
  if (explicitQuestion) return explicitQuestion;

  const hint = field.promptHint?.trim();
  if (hint?.endsWith('?')) return hint;

  const label = field.label?.trim() ?? '';
  if (label && label.endsWith('?')) return label;
  return label ? `Can you tell me about ${label.toLowerCase()}?` : 'Add a question to preview this intake flow.';
};

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
  const intakeTemplate = previewConfig.intakeTemplate ?? null;
  const [intakePreviewView, setIntakePreviewView] = useState<'home' | 'chat'>('home');
  const [intakePreviewMode, setIntakePreviewMode] = useState<'consultation' | 'message'>('consultation');
  const [showIntakeDisclaimer, setShowIntakeDisclaimer] = useState(false);
  const [intakePreviewStep, setIntakePreviewStep] = useState<'contact' | 'disclaimer' | 'conversation' | 'payment'>('contact');
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
      showBack={scenario === 'intake-template' && intakePreviewView === 'chat'}
      onBack={scenario === 'intake-template' && intakePreviewView === 'chat'
        ? () => {
          setIntakePreviewView('home');
          setShowIntakeDisclaimer(false);
        }
        : undefined}
      actions={scenario === 'intake-template' ? undefined : (
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
              paymentLinkUrl: undefined,
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

    if (scenario === 'intake-template') {
      if (intakePreviewMode === 'message') {
        return introMessage
          ? [assistantMessage('preview-intake-intro', introMessage, { source: 'practice_intro', systemMessageKey: 'intro' })]
          : [assistantMessage('preview-intake-intro-empty', 'Add an opening message to preview the first assistant message.')];
      }

      const fields = Array.isArray(intakeTemplate?.fields) ? intakeTemplate.fields : [];
      const requiredFields = fields.filter((field) => (field.phase ?? (field.required ? 'required' : 'enrichment')) === 'required');
      const enrichmentFields = fields.filter((field) => (field.phase ?? (field.required ? 'required' : 'enrichment')) !== 'required');
      const orderedFields = [...requiredFields, ...enrichmentFields].slice(0, 5);

      if (orderedFields.length === 0) {
        return [assistantMessage('preview-intake-template-empty', 'Add questions to preview this intake flow.')];
      }

      const questionMessages = orderedFields.map((field, index) => {
        const question = getIntakePreviewQuestion(field);
        return assistantMessage(
          `preview-intake-template-question-${field.key}-${index}`,
          question,
          {
            source: 'preview',
            question: {
              text: question,
              fieldKey: field.key,
              fieldType: field.type,
              options: field.options,
            },
          }
        );
      });

      if (intakePreviewStep === 'contact' || intakePreviewStep === 'disclaimer') {
        return [];
      }

      const introMessages = introMessage
        ? [assistantMessage('preview-intake-consult-intro', introMessage, { source: 'practice_intro', systemMessageKey: 'intro' })]
        : [];

      if (intakePreviewStep !== 'payment' || !paymentLinkEnabled || !consultationFee) {
        return paymentLinkEnabled
          ? [
            ...introMessages,
            ...questionMessages,
            assistantMessage(
              'preview-intake-decision',
              'I have what I need to prepare your consultation request. Continue when you are ready.',
              {
                source: 'preview',
                intakeDecisionPrompt: true,
              },
            ),
          ]
          : [...introMessages, ...questionMessages];
      }

      return [
        ...introMessages,
        ...questionMessages,
        assistantMessage(
          'preview-payment-ready',
          'Your consultation request is ready. Complete the consultation fee to send it to the practice.'
        ),
        {
          ...assistantMessage(
            'preview-payment-card',
            'Use the payment button below to continue.'
          ),
          paymentRequest: {
            amount: consultationFee as MinorAmount,
            currency,
            practiceName,
            practiceLogo: practiceLogo ?? undefined,
            paymentLinkUrl: undefined,
            intakeUuid: 'preview',
            conversationId: 'preview',
            practiceId,
          },
        },
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
    intakeTemplate,
    intakePreviewMode,
    intakePreviewStep,
    paymentLinkEnabled,
    practiceId,
    practiceLogo,
    practiceName,
    scenario,
    services,
  ]);

  if (scenario === 'messenger-start' && legalDisclaimer) {
    return (
      <div className="absolute inset-0 flex h-full w-full flex-col overflow-hidden widget-shell-gradient">
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
      <div className="absolute inset-0 h-full w-full overflow-hidden widget-shell-gradient">
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

  if (scenario === 'intake-template' && intakePreviewView === 'home') {
    return (
      <div className="absolute inset-0 flex h-full w-full flex-col overflow-hidden widget-shell-gradient">
        <div className="flex h-full flex-col overflow-hidden relative">
          <div className="flex-1 overflow-y-auto">
            <WorkspaceHomeView
              practiceName={practiceName}
              practiceLogo={practiceLogo}
              recentMessage={null}
              onSendMessage={() => {
                setShowIntakeDisclaimer(false);
                setIntakePreviewMode('message');
                setIntakePreviewStep('conversation');
                setIntakePreviewView('chat');
              }}
              onRequestConsultation={() => {
                setIntakePreviewMode('consultation');
                setIntakePreviewStep('contact');
                setIntakePreviewView('chat');
              }}
              onOpenRecentMessage={noop}
            />
          </div>
        </div>
      </div>
    );
  }

  if (scenario === 'intake-template' && intakePreviewMode === 'consultation' && intakePreviewStep === 'disclaimer' && showIntakeDisclaimer) {
    return (
      <div className="absolute inset-0 flex h-full w-full flex-col overflow-hidden widget-shell-gradient">
        {header('Please read and accept to continue')}
        <div className="flex-1 min-h-0" />
        <div className="sticky bottom-0 z-[1000] w-full">
          <ChatActionCard
            isOpen={true}
            type="disclaimer"
            onClose={() => {
              setShowIntakeDisclaimer(false);
            }}
            disclaimerProps={{
              text: legalDisclaimer,
              onAccept: async () => {
                setShowIntakeDisclaimer(false);
                setIntakePreviewStep('conversation');
              },
              isSubmitting: false,
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 flex h-full w-full flex-col overflow-hidden widget-shell-gradient">
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
              : scenario === 'intake-template'
                ? intakePreviewMode === 'consultation'
                  ? 'Consultation request'
                  : ''
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
        intakeStatus={scenario === 'consultation-payment'
          ? {
            step: paymentLinkEnabled ? 'payment_required' : 'ready_to_submit',
            intakeUuid: 'preview',
            paymentRequired: paymentLinkEnabled,
            paymentReceived: false,
          }
          : scenario === 'intake-template' && intakePreviewMode === 'consultation'
            ? {
              step: intakePreviewStep === 'contact'
                ? 'contact_form_slim'
                : intakePreviewStep === 'payment'
                  ? 'payment_required'
                  : paymentLinkEnabled
                    ? 'contact_form_decision'
                    : 'ready_to_submit',
              intakeUuid: intakePreviewStep === 'contact' ? null : 'preview',
              paymentRequired: paymentLinkEnabled,
              paymentReceived: false,
            }
            : undefined}
        intakeConversationState={scenario === 'intake-template' && intakePreviewMode === 'consultation'
          ? {
            practiceServiceUuid: null,
            description: 'Preview case summary',
            urgency: null,
            opposingParty: null,
            city: 'Durham',
            state: 'NC',
            desiredOutcome: null,
            courtDate: null,
            hasDocuments: null,
            householdSize: null,
            turnCount: 3,
            ctaShown: intakePreviewStep !== 'contact',
            ctaResponse: null,
            notYetCount: 0,
            enrichmentMode: false,
          }
          : undefined}
        onSlimFormContinue={scenario === 'intake-template' && intakePreviewMode === 'consultation'
          ? async () => {
            if (legalDisclaimer) {
              setShowIntakeDisclaimer(true);
              setIntakePreviewStep('disclaimer');
              return;
            }
            setIntakePreviewStep('conversation');
          }
          : undefined}
        onSubmitNow={scenario === 'intake-template' && intakePreviewMode === 'consultation' && paymentLinkEnabled
          ? async () => {
            setIntakePreviewStep('payment');
          }
          : undefined}
        slimContactDraft={scenario === 'intake-template' && intakePreviewMode === 'consultation'
          ? {
            name: 'Jordan Client',
            email: 'jordan@example.com',
            phone: '(919) 555-0142',
          }
          : undefined}
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
        hideMessageActions={scenario === 'intake-template'}
        hasMoreMessages={false}
        isLoadingMoreMessages={false}
        onLoadMoreMessages={noopAsync}
        hideComposer={scenario === 'intake-template'}
      />
    </div>
  );
};
