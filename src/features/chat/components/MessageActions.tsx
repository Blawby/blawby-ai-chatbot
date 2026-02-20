import { FunctionComponent } from 'preact';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { useTranslation } from '@/shared/i18n/hooks';
import { IntakePaymentCard } from '@/features/intake/components/IntakePaymentCard';
import type { IntakePaymentRequest } from '@/shared/utils/intakePayments';
import DocumentChecklist from '@/features/intake/components/DocumentChecklist';
import MatterCanvas from '@/features/matters/components/MatterCanvas';
import { DocumentIcon } from "@heroicons/react/24/outline";
import { formatDocumentIconSize } from '@/features/chat/utils/fileUtils';
import { Button } from '@/shared/ui/Button';
import type { IntakeConversationState } from '@/shared/types/intake';

interface MessageActionsProps {
	matterCanvas?: {
		matterId?: string;
		matterNumber?: string;
		service: string;
		matterSummary: string;
		answers?: Record<string, string>;
		isExpanded?: boolean;
	};
	intakeStatus?: {
		step?: string;
		decision?: string;
		intakeUuid?: string | null;
		paymentRequired?: boolean;
		paymentReceived?: boolean;
	};
	paymentRequest?: IntakePaymentRequest;
	onOpenPayment?: (request: IntakePaymentRequest) => void;
	documentChecklist?: {
		matterType: string;
		documents: Array<{
			id: string;
			name: string;
			description?: string;
			required: boolean;
			status: 'missing' | 'uploaded' | 'pending';
			file?: File;
		}>;
	};
	generatedPDF?: {
		filename: string;
		size: number;
		generatedAt: string;
		matterType: string;
		storageKey?: string;
	};
	modeSelector?: {
		onAskQuestion: () => void;
		onRequestConsultation: () => void;
		showAskQuestion?: boolean;
		showRequestConsultation?: boolean;
	};
	assistantRetry?: {
		label?: string;
		status?: 'error' | 'retrying';
		onRetry?: () => void;
	};
	authCta?: {
		label: string;
	};
	onAuthPromptRequest?: () => void;
	leadReview?: {
		canReview: boolean;
		isSubmitting?: boolean;
		onAccept: () => void;
		onReject: () => void;
		onConvert?: () => void;
	};
	intakeConversationState?: IntakeConversationState | null;
	quickReplies?: string[];
	onQuickReply?: (text: string) => void;
	showIntakeCta?: boolean;
	onIntakeCtaResponse?: (response: 'ready' | 'not_yet') => void;
	onSubmitNow?: () => void | Promise<void>;
	showIntakeDecisionPrompt?: boolean;
	onBuildBrief?: () => void;
	className?: string;
}

export const MessageActions: FunctionComponent<MessageActionsProps> = ({
	matterCanvas,
	intakeStatus,
	documentChecklist,
	generatedPDF,
	paymentRequest,
	onOpenPayment,
	modeSelector,
	assistantRetry,
	authCta,
	onAuthPromptRequest,
	leadReview,
	intakeConversationState,
	quickReplies,
	onQuickReply,
	showIntakeCta,
	onIntakeCtaResponse,
	onSubmitNow,
	showIntakeDecisionPrompt,
	onBuildBrief,
	className = ''
}) => {
	const { showSuccess, showInfo } = useToastContext();
	const { t } = useTranslation('common');

	const strength = intakeConversationState?.caseStrength ?? null;
	const isIntakeCompleted = intakeStatus?.step === 'completed';
	const shouldShowAuthCta = Boolean(authCta?.label && onAuthPromptRequest && !isIntakeCompleted);
	const shouldShowDecisionPrompt = Boolean(showIntakeDecisionPrompt && intakeStatus?.step === 'contact_form_decision');
	const shouldShowPaymentCard = Boolean(paymentRequest && intakeStatus?.paymentReceived !== true);
	const strengthTier = (() => {
		if (!strength) return 'none';
		if (strength === 'needs_more_info') return 'weak';
		if (strength === 'strong') return 'strong';
		if (intakeConversationState?.missingSummary) return 'basic';
		return 'good';
	})() as 'none' | 'weak' | 'basic' | 'good' | 'strong';
	const showCtaButtons = Boolean(showIntakeCta && (onIntakeCtaResponse || onSubmitNow) && intakeConversationState?.ctaResponse !== 'ready');
	const canShowNotYet = (intakeConversationState?.notYetCount ?? 0) < 2;
	const ctaPrimaryLabel = strengthTier === 'strong'
		? t('chat.cta.submit')
		: strengthTier === 'good'
			? t('chat.cta.reviewSubmit')
			: strengthTier === 'basic'
				? t('chat.continue')
				: t('chat.cta.continue');
	const ctaSecondaryLabel = strengthTier === 'strong'
		? t('chat.cta.addMore')
		: strengthTier === 'good'
			? t('chat.cta.addMore')
			: t('chat.cta.notYet');

	return (
		<div className={className}>
			{assistantRetry?.onRetry && (
				<div className="mt-3">
					<Button
						variant="secondary"
						size="sm"
						onClick={assistantRetry.onRetry}
						disabled={assistantRetry.status === 'retrying'}
					>
						{assistantRetry.status === 'retrying' ? t('chat.retrying') : (assistantRetry.label ?? t('chat.retry'))}
					</Button>
				</div>
			)}
			{shouldShowAuthCta && (
				<div className="mt-3">
					<Button variant="primary" size="sm" onClick={onAuthPromptRequest}>
						{authCta?.label}
					</Button>
				</div>
			)}
			{modeSelector && (modeSelector.showAskQuestion !== false || modeSelector.showRequestConsultation !== false) && (
				<div className="mt-3 flex flex-col gap-2 sm:flex-row">
					{modeSelector.showAskQuestion !== false && (
						<Button variant="secondary" size="sm" onClick={modeSelector.onAskQuestion}>
							{t('chat.askQuestion')}
						</Button>
					)}
					{modeSelector.showRequestConsultation !== false && (
						<Button variant="secondary" size="sm" onClick={modeSelector.onRequestConsultation}>
							{t('chat.requestConsultation')}
						</Button>
					)}
				</div>
			)}
			{leadReview && (
				<div className="mt-3">
					{leadReview.canReview ? (
						<div className="flex flex-col gap-2 sm:flex-row">
							{leadReview.onConvert ? (
								<Button
									variant="primary"
									size="sm"
									onClick={leadReview.onConvert}
									disabled={leadReview.isSubmitting}
								>
									Convert to matter
								</Button>
							) : (
								<>
									<Button
										variant="primary"
										size="sm"
										onClick={leadReview.onAccept}
										disabled={leadReview.isSubmitting}
									>
										{t('leadReview.accept')}
									</Button>
									<Button
										variant="secondary"
										size="sm"
										onClick={leadReview.onReject}
										disabled={leadReview.isSubmitting}
									>
										{t('leadReview.decline')}
									</Button>
								</>
							)}
						</div>
					) : (
						<div className="text-xs text-input-placeholder">
							{t('leadReview.noPermission')}
						</div>
					)}
				</div>
			)}
			{quickReplies && quickReplies.length > 0 && onQuickReply && (
				<div className="mt-3 flex gap-2 overflow-x-auto pb-1">
					{quickReplies.map((reply, idx) => (
						<Button
							key={`${reply}-${idx}`}
							variant="secondary"
							size="sm"
							className="shrink-0"
							onClick={() => onQuickReply(reply)}
						>
							{reply}
						</Button>
					))}
				</div>
			)}
			{shouldShowDecisionPrompt && (
				<div className="mt-3 flex flex-col gap-2 sm:flex-row">
					<Button
						variant="primary"
						size="sm"
						onClick={() => {
							if (onSubmitNow) {
								void onSubmitNow();
								return;
							}
							onIntakeCtaResponse?.('ready');
						}}
					>
						{t('chat.continue')}
					</Button>
					<Button variant="secondary" size="sm" onClick={() => onBuildBrief?.()}>
						{t('chat.buildStrongerBrief')}
					</Button>
				</div>
			)}
			{showCtaButtons && (
				<div className="mt-3 space-y-3">
					{intakeConversationState?.missingSummary && strength === 'developing' && (
						<p className="text-sm leading-relaxed text-input-text">
							{intakeConversationState.missingSummary}
						</p>
					)}
					{canShowNotYet ? (
						<div className="flex flex-col gap-2 sm:flex-row">
							{strengthTier === 'basic' ? (
								<Button variant="primary" size="sm" onClick={() => {
                  if (onSubmitNow) {
                    void onSubmitNow();
                    return;
                  }
                  onIntakeCtaResponse?.('ready');
                }}>
									{ctaPrimaryLabel}
								</Button>
							) : (
								<Button variant="primary" size="sm" onClick={() => {
									if (onSubmitNow) {
										void onSubmitNow();
										return;
									}
									onIntakeCtaResponse?.('ready');
								}}>
									{ctaPrimaryLabel}
								</Button>
							)}
							<Button variant="secondary" size="sm" onClick={() => onIntakeCtaResponse?.('not_yet')}>
								{ctaSecondaryLabel}
							</Button>
						</div>
					) : (
						<Button variant="primary" size="sm" onClick={() => {
							if (onSubmitNow) {
								void onSubmitNow();
								return;
							}
							onIntakeCtaResponse?.('ready');
						}}>
							{t('chat.cta.submitConsultationRequest')}
						</Button>
					)}
				</div>
			)}
			{/* Display matter canvas */}
			{matterCanvas && (
				<MatterCanvas
					matterId={matterCanvas.matterId}
					matterNumber={matterCanvas.matterNumber}
					service={matterCanvas.service}
					matterSummary={matterCanvas.matterSummary}
					answers={matterCanvas.answers || {}}
				/>
			)}
			
			{shouldShowPaymentCard && paymentRequest && (
				<IntakePaymentCard paymentRequest={paymentRequest} onOpenPayment={onOpenPayment} />
			)}
			
			{/* Display document checklist */}
			{documentChecklist && (
				<DocumentChecklist
					matterType={documentChecklist.matterType}
					documents={documentChecklist.documents}
					onDocumentUpload={(documentId, file) => {
						if (file) {
							showSuccess('Document Uploaded', `Document "${file.name}" uploaded successfully for ${documentId}`);
						}
					}}
					onDocumentRemove={(documentId) => {
						showInfo('Document Removed', `Document ${documentId} removed from checklist`);
					}}
					onComplete={() => {
						showSuccess('Checklist Complete', 'Document checklist completed! You can now proceed with your case.');
					}}
					onSkip={() => {
						showInfo('Checklist Skipped', 'Document checklist skipped. You can return to it later if needed.');
					}}
				/>
			)}

			{/* Display generated PDF */}
			{generatedPDF && (
				<div className="my-2">
					<div className="flex items-center gap-2 p-3 rounded-lg glass-panel">
						<div className="w-8 h-8 rounded bg-white/10 flex items-center justify-center flex-shrink-0">
							<DocumentIcon className="w-4 h-4 text-input-text" />
						</div>
						<div className="flex-1 min-w-0">
							<div className="text-sm font-medium text-input-text whitespace-nowrap overflow-hidden text-ellipsis" title={generatedPDF.filename}>
								{generatedPDF.filename.length > 25 ? `${generatedPDF.filename.substring(0, 25)}...` : generatedPDF.filename}
							</div>
							<div className="flex items-center gap-2 text-xs text-input-placeholder">
								<span>{formatDocumentIconSize(generatedPDF.size)}</span>
								{generatedPDF.generatedAt && (
									<span>• {new Date(generatedPDF.generatedAt).toLocaleDateString()}</span>
								)}
							</div>
						</div>
							{generatedPDF.storageKey && (
								<Button
									variant="secondary"
									size="sm"
									className="text-[10px] h-7 px-3 uppercase tracking-wider font-bold"
									onClick={() => {
										const storageKey = generatedPDF.storageKey;
										if (!storageKey) return;
										const downloadUrl = storageKey.startsWith('http') 
											? storageKey 
											: `/api/files/${storageKey}`;
										const link = globalThis.document.createElement('a');
										link.href = downloadUrl;
										link.download = generatedPDF.filename;
										link.click();
									}}
									aria-label={`Download ${generatedPDF.filename}`}
								>
									Download
								</Button>
							)}
					</div>
				</div>
			)}
		</div>
	);
};
