import { FunctionComponent } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { useTranslation } from '@/shared/i18n/hooks';
import { IntakePaymentCard } from '@/features/intake/components/IntakePaymentCard';
import type { IntakePaymentRequest } from '@/shared/utils/intakePayments';
import DocumentChecklist from '@/features/intake/components/DocumentChecklist';
import MatterCanvas from '@/features/matters/components/MatterCanvas';
import { DocumentIcon } from "@heroicons/react/24/outline";
import { Icon } from '@/shared/ui/Icon';
import { formatDocumentIconSize } from '@/features/chat/utils/fileUtils';
import { Button } from '@/shared/ui/Button';
import type { IntakeConversationState } from '@/shared/types/intake';
import type { ChatMessageAction } from '@/shared/types/conversation';
import { SettingsNotice } from '@/features/settings/components/SettingsNotice';
import { quickActionDebugLog, isQuickActionDebugEnabled } from '@/shared/utils/quickActionDebug';
import { getChatActionKey } from '@/shared/utils/chatActions';

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
		intake?: {
			name?: string;
			email?: string;
			phone?: string;
			description?: string;
			opposingParty?: string;
			urgency?: string;
			paymentStatus?: string;
			triageStatus?: string;
			triageReason?: string;
			amount?: number;
			currency?: string;
			submittedAt?: string;
		};
		onAccept: () => void;
		onReject: () => void;
		onConvert?: () => void;
	};
	intakeConversationState?: IntakeConversationState | null;
	actions?: ChatMessageAction[];
	onActionReply?: (text: string) => void;
	onSubmitNow?: () => void | Promise<void>;
	onBuildBrief?: () => void;
	onboardingProfile?: {
		completionScore?: number;
		missingFields?: string[];
		summaryFields?: Array<{ label: string; value: string }>;
		serviceNames?: string[];
		canSave?: boolean;
		isSaving?: boolean;
		saveError?: string | null;
		onSaveAll?: () => void | Promise<void>;
		onEditBasics?: () => void;
		onEditContact?: () => void;
		logo?: {
			imageUrl: string | null;
			name: string;
			uploading: boolean;
			progress: number | null;
			onChange: (files: FileList | File[]) => void;
		};
	};
	isLast?: boolean;
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
	intakeConversationState: _intakeConversationState,
	actions,
	onActionReply,
	onSubmitNow,
	onBuildBrief,
	onboardingProfile,
	isLast,
	className = ''
}) => {
	const { showSuccess, showInfo } = useToastContext();
	const { t } = useTranslation('common');
	const quickActionRenderSnapshotRef = useRef('');

	const isIntakeCompleted = intakeStatus?.step === 'completed';
	const shouldShowAuthCta = Boolean(authCta?.label && onAuthPromptRequest && !isIntakeCompleted);
	const shouldShowPaymentCard = Boolean(paymentRequest && intakeStatus?.paymentReceived !== true);
	const renderableActions = (actions ?? []).filter((action) => {
		switch (action.type) {
			case 'reply':
				return Boolean(onActionReply);
			case 'submit':
				return Boolean(onSubmitNow);
			case 'continue_payment':
				return Boolean(onOpenPayment && paymentRequest);
			case 'open_url':
				return true;
			case 'build_brief':
				return Boolean(onBuildBrief);
		}
	});
	const leadIntake = leadReview?.intake;
	const formatLeadAmount = (amount?: number, currency?: string) => {
		if (typeof amount !== 'number' || !Number.isFinite(amount)) return null;
		try {
			return new Intl.NumberFormat(undefined, {
				style: 'currency',
				currency: currency || 'USD'
			}).format(amount / 100);
		} catch {
			return `${amount / 100} ${currency || 'USD'}`;
		}
	};
	const paymentAmount = formatLeadAmount(leadIntake?.amount, leadIntake?.currency);

	useEffect(() => {
		if (!isQuickActionDebugEnabled()) return;
		const snapshot = JSON.stringify({
			isLast: Boolean(isLast),
			actions: actions ?? null,
			renderableActionsCount: renderableActions.length,
			shouldShowPaymentCard,
			hasPaymentRequest: Boolean(paymentRequest),
		});
		if (snapshot === quickActionRenderSnapshotRef.current) return;
		quickActionRenderSnapshotRef.current = snapshot;
		quickActionDebugLog('MessageActions render gating', {
			isLast: Boolean(isLast),
			actions: actions ?? null,
			renderableActionsCount: renderableActions.length,
			shouldShowPaymentCard,
			hasPaymentRequest: Boolean(paymentRequest),
		});
	}, [
		actions,
		isLast,
		paymentRequest,
		renderableActions.length,
		shouldShowPaymentCard
	]);

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
						<Button variant="primary" size="sm" onClick={modeSelector.onRequestConsultation}>
							{t('chat.requestConsultation')}
						</Button>
					)}
				</div>
			)}
			{leadReview && (
				<div className="mt-3">
					{leadIntake && (
						<div className="mb-3 rounded-2xl border border-line-glass/40 bg-black/10 p-3 text-sm text-input-text">
							<div className="flex flex-col gap-2">
								<div className="flex flex-wrap items-center gap-x-3 gap-y-1">
									<span className="font-medium text-input-text">{leadIntake.name || t('leadIntake.newIntake')}</span>
									{leadIntake.email ? <span className="text-input-placeholder">{leadIntake.email}</span> : null}
									{leadIntake.phone ? <span className="text-input-placeholder">{leadIntake.phone}</span> : null}
								</div>
								<div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-input-placeholder">
									{leadIntake.urgency ? <span>{t('leadIntake.urgency')}: {leadIntake.urgency.replace(/_/g, ' ')}</span> : null}
									{leadIntake.paymentStatus ? <span>{t('leadIntake.payment')}: {leadIntake.paymentStatus.replace(/_/g, ' ')}</span> : null}
									{leadIntake.triageStatus ? <span>{t('leadIntake.triage')}: {leadIntake.triageStatus.replace(/_/g, ' ')}</span> : null}
									{paymentAmount ? <span>{t('leadIntake.fee')}: {paymentAmount}</span> : null}
								</div>
								{leadIntake.opposingParty ? (
									<div className="text-xs text-input-placeholder">
										<span className="font-medium text-input-text">{t('leadIntake.opposingParty')}:</span> {leadIntake.opposingParty}
									</div>
								) : null}
								{leadIntake.description ? (
									<p className="text-sm text-input-text/90">{leadIntake.description}</p>
								) : null}
								{leadIntake.triageReason ? (
									<div className="text-xs text-input-placeholder">
										<span className="font-medium text-input-text">{t('leadIntake.reason')}:</span> {leadIntake.triageReason}
									</div>
								) : null}
							</div>
						</div>
					)}
					{leadReview.canReview ? (
						<div className="flex flex-col gap-2 sm:flex-row">
							{leadReview.onConvert ? (
								<Button
									variant="primary"
									size="sm"
									onClick={leadReview.onConvert}
									disabled={leadReview.isSubmitting}
								>
									{t('leadReview.convert')}
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
			{isLast && renderableActions.length > 0 && (
				<div className="mt-3 flex gap-2 overflow-x-auto pb-1">
					{renderableActions.map((action, idx) => (
						action.type === 'continue_payment' ? (
							(onOpenPayment && paymentRequest) ? (
								<Button
									key={getChatActionKey(action, idx)}
									variant={action.variant === 'primary' ? 'primary' : 'secondary'}
									size="sm"
									className="shrink-0"
									onClick={() => {
										onOpenPayment?.(paymentRequest);
									}}
								>
									{action.label}
								</Button>
							) : null
						) : action.type === 'submit' ? (
							onSubmitNow ? (
								<Button
									key={getChatActionKey(action, idx)}
									variant={action.variant === 'primary' ? 'primary' : 'secondary'}
									size="sm"
									className="shrink-0"
									onClick={() => {
										void onSubmitNow();
									}}
								>
									{action.label}
								</Button>
							) : null
						) : action.type === 'open_url' ? (
							(() => {
								return (
									<Button
										key={getChatActionKey(action, idx)}
										variant={action.variant === 'primary' ? 'primary' : 'secondary'}
										size="sm"
										className="shrink-0"
										onClick={() => {
											try {
												const parsed = new URL(action.url);
												if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
													window.open(action.url, '_blank', 'noopener,noreferrer');
												} else {
													console.warn('[MessageActions] Blocked unsafe URL protocol:', parsed.protocol);
												showInfo('Link Cannot Open', `This link uses an unsafe protocol: ${parsed.protocol}`);
											}
										} catch {
											console.warn('[MessageActions] Invalid URL format:', action.url);
											showInfo('Invalid Link', `Cannot open link with invalid URL format: ${action.url}`);
										}
									}}
									>
									{action.label}
								</Button>
							);
							})()
						) : action.type === 'build_brief' ? (
							onBuildBrief ? (
								<Button
									key={getChatActionKey(action, idx)}
									variant={action.variant === 'primary' ? 'primary' : 'secondary'}
									size="sm"
									className="shrink-0"
									onClick={() => onBuildBrief()}
								>
									{action.label}
								</Button>
							) : null
						) : (
							onActionReply ? (
								<Button
									key={getChatActionKey(action, idx)}
									variant={action.variant === 'primary' ? 'primary' : 'secondary'}
									size="sm"
									className="shrink-0"
									onClick={() => onActionReply(action.value)}
								>
									{action.label}
								</Button>
							) : null
						)
					))}
				</div>
			)}
			{isLast && onboardingProfile && (
				<div className="mt-3 space-y-3">
					{onboardingProfile.saveError && (
						<SettingsNotice variant="danger">
							{onboardingProfile.saveError}
						</SettingsNotice>
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
							<Icon icon={DocumentIcon} className="w-4 h-4 text-input-text"  />
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
