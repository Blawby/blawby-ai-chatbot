import type { Conversation, ConversationMode, SetupFieldsPayload } from '@/shared/types/conversation';
import { type PracticeDetails } from '@/shared/lib/apiClient';
import type { BackendMatter } from '@/features/matters/services/mattersApi';
import type { MatterStatus } from '@/shared/types/matterStatus';
import { InvoiceInspector } from '@/features/invoices/components/InvoiceInspector';
import { ClientInspector } from '@/features/clients/components/ClientInspector';
import { MatterInspector } from '@/features/matters/components/MatterInspector';
import { ConversationInspector } from '@/features/chat/components/ConversationInspector';
import { Button } from '@/shared/ui/Button';
import { type ComboboxOption } from '@/shared/ui/input';
import { InspectorIdentity } from './identityHelpers';
import { X } from 'lucide-preact';
import type { IntakeConversationState, DerivedIntakeStatus } from '@/shared/types/intake';
import type { PracticeIntakeDetail } from '@/features/intake/api/intakesApi';
import type { PracticeSetupStatus } from '@/features/practice-setup/utils/status';
import type { BusinessOnboardingStatus } from '@/shared/hooks/usePracticeManagement';

type InspectorConfig =
  | { type: 'conversation' }
  | { type: 'matter' }
  | { type: 'client' }
  | { type: 'invoice' };

type InspectorEntityType = InspectorConfig['type'];

type InspectorPanelProps = {
  entityType: InspectorEntityType;
  entityId: string;
  practiceId: string;
  onClose: () => void;
  conversation?: Conversation | null;
  conversationMembers?: InspectorIdentity[];
  onConversationAssignedToChange?: (assignedTo: string | null) => Promise<void> | void;
  onConversationPriorityChange?: (priority: 'low' | 'normal' | 'high' | 'urgent') => Promise<void> | void;
  onConversationTagsChange?: (tags: string[]) => Promise<void> | void;
  onConversationMatterChange?: (matterId: string | null) => Promise<void> | void;
  matterClientName?: string | null;
  matterAssigneeNames?: string[];
  matterBillingLabel?: string | null;
  matterCreatedLabel?: string | null;
  matterUpdatedLabel?: string | null;
  matterClientId?: string | null;
  matterUrgency?: string | null;
  matterResponsibleAttorneyId?: string | null;
  matterOriginatingAttorneyId?: string | null;
  matterCaseNumber?: string | null;
  matterType?: string | null;
  matterCourt?: string | null;
  matterJudge?: string | null;
  matterOpposingParty?: string | null;
  matterOpposingCounsel?: string | null;
  onMatterStatusChange?: (status: MatterStatus) => void;
  onMatterPatchChange?: (patch: Record<string, unknown>) => Promise<void> | void;
  matterClientOptions?: ComboboxOption[];
  matterClients?: InspectorIdentity[];
  matterAssigneeOptions?: ComboboxOption[];
  invoiceClientName?: string | null;
  invoiceMatterTitle?: string | null;
  invoiceStatus?: string | null;
  invoiceTotal?: string | null;
  invoiceAmountDue?: string | null;
  invoiceDueDate?: string | null;
  matters?: BackendMatter[];
  isClientView?: boolean;
  practiceName?: string;
  practiceLogo?: string;
  intakeConversationState?: IntakeConversationState | null;
  intakeStatus?: DerivedIntakeStatus | null;
  intake?: PracticeIntakeDetail | null;
  onIntakeFieldsChange?: (patch: Partial<IntakeConversationState>, options?: import('@/shared/types/intake').IntakeFieldChangeOptions) => Promise<void> | void;
  practiceDetails?: PracticeDetails | null;
  conversationMode?: ConversationMode;
  setupFields?: SetupFieldsPayload;
  onSetupFieldsChange?: (patch: Partial<SetupFieldsPayload>, options?: { sendSystemAck?: boolean }) => Promise<void> | void;
  setupStatus?: PracticeSetupStatus;
  onStartStripeOnboarding?: () => void;
  isStripeSubmitting?: boolean;
  practiceSlug?: string | null;
  businessOnboardingStatus?: BusinessOnboardingStatus | null;
  showCloseButton?: boolean;
};


export const InspectorPanel = ({
  entityType,
  entityId,
  practiceId,
  onClose,
  conversation,
  conversationMembers = [],
  onConversationAssignedToChange,
  onConversationPriorityChange,
  onConversationTagsChange,
  onConversationMatterChange,
  matterClientName,
  matterAssigneeNames,
  matterBillingLabel: _matterBillingLabel,
  matterCreatedLabel,
  matterUpdatedLabel,
  matterClientId,
  matterUrgency,
  matterResponsibleAttorneyId,
  matterOriginatingAttorneyId,
  matterCaseNumber,
  matterType,
  matterCourt,
  matterJudge,
  matterOpposingParty,
  matterOpposingCounsel,
  onMatterStatusChange,
  onMatterPatchChange,
  matterClientOptions = [],
  matterClients = [],
  matterAssigneeOptions = [],
  invoiceClientName,
  invoiceMatterTitle,
  invoiceStatus,
  invoiceTotal,
  invoiceAmountDue,
  invoiceDueDate,
  matters = [],
  isClientView,
  practiceName,
  practiceLogo,
  intakeConversationState,
  intakeStatus,
  intake,
  onIntakeFieldsChange,
  practiceDetails: propPracticeDetails,
  conversationMode,
  setupFields,
  onSetupFieldsChange,
  setupStatus,
  onStartStripeOnboarding,
  isStripeSubmitting = false,
  practiceSlug,
  businessOnboardingStatus,
  showCloseButton = true,
}: InspectorPanelProps) => {
  return (
    <div className="flex h-full min-h-0 flex-col bg-transparent">
      <div className="flex items-center justify-between border-b border-line-subtle px-4 py-3">
        <h2 className="text-sm font-semibold text-ink">
          {entityType === 'conversation'
            ? 'Conversation Info'
            : entityType === 'matter'
              ? 'Matter Info'
              : entityType === 'invoice'
                ? 'Invoice Info'
                : 'Contact Info'}
        </h2>
        {showCloseButton ? (
          <Button
            variant="icon"
            size="icon-sm"
            onClick={onClose}
            aria-label="Close inspector"
            icon={X} iconClassName="h-4 w-4"
          />
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* All loading skeletons + errors render inside per-feature inspectors. */}

        {entityType === 'conversation' && practiceId && entityId ? (
          <ConversationInspector
            practiceId={practiceId}
            entityId={entityId}
            conversation={conversation}
            conversationMembers={conversationMembers}
            matters={matters}
            isClientView={isClientView}
            practiceName={practiceName}
            practiceLogo={practiceLogo}
            conversationMode={conversationMode}
            setupFields={setupFields}
            onSetupFieldsChange={onSetupFieldsChange}
            setupStatus={setupStatus}
            onStartStripeOnboarding={onStartStripeOnboarding}
            isStripeSubmitting={isStripeSubmitting}
            practiceSlug={practiceSlug}
            businessOnboardingStatus={businessOnboardingStatus}
            intakeConversationState={intakeConversationState}
            intakeStatus={intakeStatus}
            intake={intake}
            onIntakeFieldsChange={onIntakeFieldsChange}
            practiceDetails={propPracticeDetails}
            onConversationAssignedToChange={onConversationAssignedToChange}
            onConversationPriorityChange={onConversationPriorityChange}
            onConversationTagsChange={onConversationTagsChange}
            onConversationMatterChange={onConversationMatterChange}
          />
        ) : null}

        {entityType === 'matter' && practiceId && entityId ? (
          <MatterInspector
            practiceId={practiceId}
            entityId={entityId}
            matterClientName={matterClientName}
            matterAssigneeNames={matterAssigneeNames}
            matterCreatedLabel={matterCreatedLabel}
            matterUpdatedLabel={matterUpdatedLabel}
            matterClientId={matterClientId}
            matterUrgency={matterUrgency}
            matterResponsibleAttorneyId={matterResponsibleAttorneyId}
            matterOriginatingAttorneyId={matterOriginatingAttorneyId}
            matterCaseNumber={matterCaseNumber}
            matterType={matterType}
            matterCourt={matterCourt}
            matterJudge={matterJudge}
            matterOpposingParty={matterOpposingParty}
            matterOpposingCounsel={matterOpposingCounsel}
            matterClientOptions={matterClientOptions}
            matterClients={matterClients}
            matterAssigneeOptions={matterAssigneeOptions}
            conversationMembers={conversationMembers}
            onMatterStatusChange={onMatterStatusChange}
            onMatterPatchChange={onMatterPatchChange}
          />
        ) : null}


        {entityType === 'client' && practiceId && entityId ? (
          <ClientInspector practiceId={practiceId} entityId={entityId} />
        ) : null}

        {entityType === 'invoice' ? (
          <InvoiceInspector
            clientName={invoiceClientName}
            matterTitle={invoiceMatterTitle}
            status={invoiceStatus}
            total={invoiceTotal}
            amountDue={invoiceAmountDue}
            dueDate={invoiceDueDate}
          />
        ) : null}
      </div>
    </div>
  );
};

export default InspectorPanel;
