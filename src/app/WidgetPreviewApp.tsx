import { FunctionComponent, type ComponentChildren } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import { X } from 'lucide-preact';

import { ChatActionCard } from '@/features/chat/components/ChatActionCard';
import ChatContainer from '@/features/chat/components/ChatContainer';
import WorkspaceHomeView from '@/features/chat/views/WorkspaceHomeView';
import { Button } from '@/shared/ui/Button';
import { DetailHeader } from '@/shared/ui/layout/DetailHeader';
import type { UIPracticeConfig } from '@/shared/hooks/usePracticeConfig';
import type { WidgetPreviewConfig, WidgetPreviewScenario } from '@/shared/types/widgetPreview';
import type { ChatMessageUI, FileAttachment } from '../../worker/types';
import type { MinorAmount } from '@/shared/utils/money';
import { IntakeProvider } from '@/shared/contexts/IntakeContext';

type WidgetPreviewAppProps = {
  practiceId: string;
  practiceConfig: UIPracticeConfig;
  scenario: WidgetPreviewScenario;
  previewConfig: WidgetPreviewConfig;
  /**
   * For the intake-template scenario, controls where the preview opens.
   * 'home' (default) shows the WorkspaceHomeView; the user clicks through
   * Request Consultation to reach the question flow. 'conversation' skips
   * straight to the chat view with the intake questions visible — useful
   * for editor previews where the practice owner wants to see how their
   * questions render at a glance.
   */
  initialIntakeStep?: 'home' | 'conversation';
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

const userMessage = (id: string, content: string): ChatMessageUI => ({
  id,
  role: 'user',
  content,
  timestamp: Date.now(),
  reply_to_message_id: null,
  metadata: { source: 'preview' },
  isUser: true,
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

const hashIndex = (seed: string, modulo: number): number => {
  if (modulo <= 0) return 0;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash + seed.charCodeAt(i)) % modulo;
  return hash;
};

const MOCK_DATE_REPLIES = ['January 15, 2024', 'Last week', 'About a month ago', 'March 3, 2024', 'Two days ago'];
const MOCK_NUMBER_REPLIES = ['5', '1000', '3', '2', 'About 10'];
const MOCK_CITY_REPLIES = ['Los Angeles', 'New York', 'Chicago', 'Houston', 'Phoenix'];
const MOCK_STATE_REPLIES = ['California', 'New York', 'Texas', 'Florida', 'Illinois'];
const MOCK_TIME_REPLIES = ['Last week', 'About a month ago', 'Two days ago', 'Yesterday', 'In January'];
const MOCK_COUNT_REPLIES = ['5', 'About 10', '2 or 3', 'Several', 'Around 7'];
const MOCK_TEXT_REPLIES = [
  'I need to think about that.',
  'Let me describe what happened.',
  'I remember some details.',
  'It was quite recent.',
  'I can provide more information.',
];

const generateMockReply = (
  field: NonNullable<WidgetPreviewConfig['intakeTemplate']>['fields'][number],
  prompt: string,
): string => {
  const seed = field.key;
  const lowerPrompt = prompt.toLowerCase();

  if (field.type === 'select' && field.options && field.options.length > 0) {
    return field.options[hashIndex(seed, field.options.length)];
  }
  if (field.type === 'date') return MOCK_DATE_REPLIES[hashIndex(seed, MOCK_DATE_REPLIES.length)];
  if (field.type === 'boolean') return hashIndex(seed, 2) === 0 ? 'Yes' : 'No';
  if (field.type === 'number') return MOCK_NUMBER_REPLIES[hashIndex(seed, MOCK_NUMBER_REPLIES.length)];
  if (lowerPrompt.includes('city')) return MOCK_CITY_REPLIES[hashIndex(seed, MOCK_CITY_REPLIES.length)];
  if (lowerPrompt.includes('state')) return MOCK_STATE_REPLIES[hashIndex(seed, MOCK_STATE_REPLIES.length)];
  if (lowerPrompt.includes('when') || lowerPrompt.includes('date') || lowerPrompt.includes('time')) {
    return MOCK_TIME_REPLIES[hashIndex(seed, MOCK_TIME_REPLIES.length)];
  }
  if (lowerPrompt.includes('how many') || lowerPrompt.includes('how much')) {
    return MOCK_COUNT_REPLIES[hashIndex(seed, MOCK_COUNT_REPLIES.length)];
  }
  return MOCK_TEXT_REPLIES[hashIndex(seed, MOCK_TEXT_REPLIES.length)];
};

export const WidgetPreviewApp: FunctionComponent<WidgetPreviewAppProps> = ({
  practiceId,
  practiceConfig,
  scenario,
  previewConfig,
  initialIntakeStep = 'home',
}) => {
  const practiceName = practiceConfig.name || 'Blawby Messenger';
  const practiceLogo = practiceConfig.profileImage ?? null;
  const introMessage = previewConfig.introMessage?.trim() || practiceConfig.introMessage?.trim() || '';
  const legalDisclaimer = previewConfig.legalDisclaimer?.trim() || practiceConfig.legalDisclaimer?.trim() || '';
  const services = useMemo(() => previewConfig.services ?? [], [previewConfig.services]);
  const intakeTemplate = previewConfig.intakeTemplate ?? null;
  const skipHome = initialIntakeStep === 'conversation';
  const [intakePreviewView, setIntakePreviewView] = useState<'home' | 'chat'>(skipHome ? 'chat' : 'home');
  const [intakePreviewMode, setIntakePreviewMode] = useState<'consultation' | 'message'>('consultation');
  const [showIntakeDisclaimer, setShowIntakeDisclaimer] = useState(false);
  const [intakePreviewStep, setIntakePreviewStep] = useState<'contact' | 'disclaimer' | 'conversation' | 'payment'>(skipHome ? 'conversation' : 'contact');
  const consultationFee = typeof previewConfig.consultationFee === 'number'
    ? previewConfig.consultationFee
    : typeof practiceConfig.consultationFee === 'number'
      ? practiceConfig.consultationFee
      : null;
  const paymentLinkEnabled = Boolean(previewConfig.paymentLinkEnabled);
  const currency = previewConfig.currency || 'USD';
  const intakeProviderValue = {
    intakeStatus: null,
    intakeConversationState: null,
    onIntakeCtaResponse: undefined,
    onSubmitNow: undefined,
    onBuildBrief: undefined,
    onStrengthenCase: undefined,
    slimContactDraft: null,
    onSlimFormContinue: undefined,
    onSlimFormDismiss: undefined,
    isPublicWorkspace: true,
  };
  const withIntakeProvider = (content: ComponentChildren) => (
    <IntakeProvider value={intakeProviderValue}>
      {content}
    </IntakeProvider>
  );

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
          icon={X}
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

      // Editor preview interleaves a deterministic mock client reply after
      // each question so the practice owner sees a realistic back-and-forth.
      // The regular intake-template flow (skipHome=false) keeps just the
      // questions — actual clients type their own answers.
      const questionMessages = orderedFields.flatMap((field, index) => {
        const question = getIntakePreviewQuestion(field);
        const questionMsg = assistantMessage(
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
        if (!skipHome) return [questionMsg];
        const reply = generateMockReply(field, question);
        return [
          questionMsg,
          userMessage(`preview-intake-template-reply-${field.key}-${index}`, reply),
        ];
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
    skipHome,
  ]);

  if (scenario === 'messenger-start' && legalDisclaimer) {
    return (
      withIntakeProvider(
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
      )
    );
  }

  if (scenario === 'messenger-start' && !introMessage && !legalDisclaimer) {
    return (
      withIntakeProvider(
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
      )
    );
  }

  if (scenario === 'intake-template' && intakePreviewView === 'home') {
    return (
      withIntakeProvider(
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
      )
    );
  }

  if (scenario === 'intake-template' && intakePreviewMode === 'consultation' && intakePreviewStep === 'disclaimer' && showIntakeDisclaimer) {
    return (
      withIntakeProvider(
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
      )
    );
  }

  return (
    withIntakeProvider(
      <div className="absolute inset-0 flex h-full w-full flex-col overflow-hidden widget-shell-gradient">
        <ChatContainer
          messages={messages}
          conversationTitle="Preview"
          onSendMessage={noop}
          isReady={true}
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
          canChat
          hideMessageActions={scenario === 'intake-template'}
          hasMoreMessages={false}
          isLoadingMoreMessages={false}
          onLoadMoreMessages={noopAsync}
          hideComposer={scenario === 'intake-template' && !skipHome}
        />
      </div>
    )
  );
};
