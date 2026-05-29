import { FunctionComponent } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { useTranslation } from '@/shared/i18n/hooks';
import { IntakePaymentCard } from '@/features/intake/components/IntakePaymentCard';
import type { IntakePaymentRequest } from '@/shared/utils/intakePayments';
import DocumentChecklist from '@/features/intake/components/DocumentChecklist';
import MatterCanvas from '@/features/matters/components/MatterCanvas';
import { File as FileIcon } from 'lucide-preact';

import { Icon } from '@/shared/ui/Icon';
import { formatDocumentIconSize } from '@/features/chat/utils/fileUtils';
import { Button } from '@/shared/ui/Button';
import type { ChatMessageAction } from '@/shared/types/conversation';
import { SettingsNotice } from '@/features/settings/components/SettingsNotice';
import { quickActionDebugLog, isQuickActionDebugEnabled } from '@/shared/utils/quickActionDebug';
import { getChatActionKey } from '@/shared/utils/chatActions';
import { useNavigation } from '@/shared/utils/navigation';
import { useIntakeContext } from '@/shared/contexts/IntakeContext';
import { apiClient, isHttpError } from '@/shared/lib/apiClient';
import { practiceAssistantDecision } from '@/config/urls';

interface MessageActionsProps {
	matterCanvas?: {
		matterId?: string;
		matterNumber?: string;
		service: string;
		matterSummary: string;
		answers?: Record<string, string>;
		isExpanded?: boolean;
	};
	paymentRequest?: IntakePaymentRequest;
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
	actions?: ChatMessageAction[];
	onActionReply?: (text: string) => void;
	practiceId?: string;
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
	isStreaming?: boolean;
	isLast?: boolean;
	className?: string;
}

export const MessageActions: FunctionComponent<MessageActionsProps> = ({
	matterCanvas,
	documentChecklist,
	generatedPDF,
	paymentRequest,
	modeSelector,
	assistantRetry,
	authCta,
	onAuthPromptRequest,
	actions,
	onActionReply,
	practiceId,
	onboardingProfile,
	isStreaming = false,
	isLast,
	className = '',
}) => {
	const { showSuccess, showInfo, showError } = useToastContext();
	const { t } = useTranslation('common');
	const { navigate } = useNavigation();
	const intakeContext = useIntakeContext();
	const quickActionRenderSnapshotRef = useRef('');
	const [resolvedPracticeAssistantActionIds, setResolvedPracticeAssistantActionIds] = useState<Set<string>>(() => new Set());
	const [pendingPracticeAssistantDecision, setPendingPracticeAssistantDecision] = useState<string | null>(null);
	const resolvedIntakeStatus = intakeContext.intakeStatus;
	const resolvedOnSubmitNow = intakeContext.onSubmitNow;
	const resolvedOnBuildBrief = intakeContext.onBuildBrief;
	const resolvedOnStrengthenCase = intakeContext.onStrengthenCase;

	const isIntakeCompleted = resolvedIntakeStatus?.step === 'completed';
	const shouldShowAuthCta = Boolean(authCta?.label && onAuthPromptRequest && !isIntakeCompleted);
	const shouldShowPaymentCard = Boolean(paymentRequest && resolvedIntakeStatus?.paymentReceived !== true);
	const renderableActions = (actions ?? []).filter((action) => {
		switch (action.type) {
			case 'reply':
				return Boolean(onActionReply);
			case 'submit':
				return Boolean(resolvedOnSubmitNow);
			case 'continue_payment':
				return Boolean(paymentRequest?.paymentLinkUrl);
			case 'open_url':
				return true;
			case 'build_brief':
				return Boolean(resolvedOnBuildBrief);
				case 'strengthen_case':
					return Boolean(resolvedOnStrengthenCase);
				case 'practice_assistant_decision':
					return Boolean(practiceId) && !resolvedPracticeAssistantActionIds.has(action.actionId);
			}
		});
	const decisionActions = renderableActions.filter((a) => a.type === 'practice_assistant_decision');
	const standardActions = renderableActions.filter((a) => a.type !== 'practice_assistant_decision');

		const decidePracticeAssistantAction = async (
			actionId: string,
			decision: 'approve' | 'reject',
		) => {
			if (!practiceId) return;
			const pendingKey = `${actionId}:${decision}`;
			setPendingPracticeAssistantDecision(pendingKey);
			try {
				await apiClient.post(
					practiceAssistantDecision(actionId, decision),
					{ practiceId },
				);
				setResolvedPracticeAssistantActionIds((prev) => new Set(prev).add(actionId));
				showSuccess(
					decision === 'approve' ? 'Assistant action approved' : 'Assistant action rejected',
					decision === 'approve' ? 'The approved action has been executed.' : 'The proposed action was rejected.',
				);
			} catch (error) {
				const message = isHttpError(error)
					? ((error.response.data as { error?: string } | undefined)?.error || `HTTP ${error.response.status}`)
					: error instanceof Error
						? error.message
						: 'Unable to update assistant action';
				showError('Assistant action failed', message);
			} finally {
				setPendingPracticeAssistantDecision(null);
			}
		};


	useEffect(() => {
		if (!isQuickActionDebugEnabled()) return;
		const snapshot = JSON.stringify({
			isLast: Boolean(isLast),
			isStreaming,
			actions: actions ?? null,
			renderableActionsCount: renderableActions.length,
			shouldShowPaymentCard,
			hasPaymentRequest: Boolean(paymentRequest),
		});
		if (snapshot === quickActionRenderSnapshotRef.current) return;
		quickActionRenderSnapshotRef.current = snapshot;
		quickActionDebugLog('MessageActions render gating', {
			isLast: Boolean(isLast),
			isStreaming,
			actions: actions ?? null,
			renderableActionsCount: renderableActions.length,
			shouldShowPaymentCard,
			hasPaymentRequest: Boolean(paymentRequest),
		});
	}, [
		actions,
		isLast,
		isStreaming,
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
			{isLast && !isStreaming && standardActions.length > 0 && (
				<div className="mt-3 flex gap-2 overflow-x-auto pb-1">
					{standardActions.map((action, idx) => (
						action.type === 'continue_payment' ? (
							(() => {
								const url = paymentRequest?.paymentLinkUrl;
								if (!url) return null;
								try {
									const parsed = new URL(url);
									if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
									return (
										<a
											key={getChatActionKey(action, idx)}
											href={url}
											target="_blank"
											rel="noopener noreferrer"
											className={`btn ${action.variant === 'primary' ? 'btn-primary' : 'btn-secondary'} btn-sm shrink-0 no-underline inline-flex items-center justify-center px-4 rounded-xl font-semibold transition-all hover:opacity-90 active:scale-[0.98] h-8 text-xs`}
										>
											{action.label}
										</a>
									);
								} catch { return null; }
							})()
						) : action.type === 'submit' ? (
							resolvedOnSubmitNow ? (
								<Button
									key={getChatActionKey(action, idx)}
									variant={action.variant === 'primary' ? 'primary' : 'secondary'}
									size="sm"
									className="shrink-0"
									onClick={() => {
										void resolvedOnSubmitNow();
									}}
								>
									{action.label}
								</Button>
							) : null
						) : action.type === 'open_url' ? (
						(() => {
							try {
								const parsed = new URL(action.url, window.location.origin);
								if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
								if (parsed.origin === window.location.origin) {
									return (
										<button
											key={getChatActionKey(action, idx)}
											type="button"
											className={`btn ${action.variant === 'primary' ? 'btn-primary' : 'btn-secondary'} btn-sm shrink-0 no-underline inline-flex items-center justify-center px-4 rounded-xl font-semibold transition-all hover:opacity-90 active:scale-[0.98] h-8 text-xs`}
											onClick={() => navigate(`${parsed.pathname}${parsed.search}${parsed.hash}`)}
										>
											{action.label}
										</button>
									);
								}
								return (
									<a
										key={getChatActionKey(action, idx)}
										href={action.url}
										target="_blank"
										rel="noopener noreferrer"
										className={`btn ${action.variant === 'primary' ? 'btn-primary' : 'btn-secondary'} btn-sm shrink-0 no-underline inline-flex items-center justify-center px-4 rounded-xl font-semibold transition-all hover:opacity-90 active:scale-[0.98] h-8 text-xs`}
									>
										{action.label}
									</a>
								);
							} catch { return null; }
						})()
						) : action.type === 'build_brief' ? (
							resolvedOnBuildBrief ? (
								<Button
									key={getChatActionKey(action, idx)}
									variant={action.variant === 'primary' ? 'primary' : 'secondary'}
									size="sm"
									className="shrink-0"
									onClick={() => resolvedOnBuildBrief()}
								>
									{action.label}
								</Button>
							) : null
							) : action.type === 'strengthen_case' ? (
								resolvedOnStrengthenCase ? (
									<Button
									key={getChatActionKey(action, idx)}
									variant={action.variant === 'primary' ? 'primary' : 'secondary'}
									size="sm"
									className="shrink-0"
									onClick={() => resolvedOnStrengthenCase()}
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
			{!isStreaming && decisionActions.length > 0 && (
				<div className="mt-3 flex gap-2 overflow-x-auto pb-1">
					{decisionActions.map((action, idx) => (
						action.type === 'practice_assistant_decision' ? (
							<Button
								key={getChatActionKey(action, idx)}
								variant={action.variant === 'primary' ? 'primary' : 'secondary'}
								size="sm"
								className="shrink-0"
								disabled={pendingPracticeAssistantDecision !== null}
								onClick={() => {
									void decidePracticeAssistantAction(action.actionId, action.decision);
								}}
							>
								{pendingPracticeAssistantDecision === `${action.actionId}:${action.decision}` ? 'Working...' : action.label}
							</Button>
						) : null
					))}
				</div>
			)}
			{isLast && !isStreaming && onboardingProfile && (
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
				<IntakePaymentCard paymentRequest={paymentRequest} />
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
					<div className="flex items-center gap-2 p-3 rounded-xl panel">
						<div className="w-8 h-8 rounded bg-surface-utility/60 dark:bg-surface-utility/10 flex items-center justify-center flex-shrink-0">
							<Icon icon={FileIcon} className="w-4 h-4 text-ink"  />
						</div>
						<div className="flex-1 min-w-0">
							<div className="text-sm font-medium text-ink whitespace-nowrap overflow-hidden text-ellipsis" title={generatedPDF.filename}>
								{generatedPDF.filename.length > 25 ? `${generatedPDF.filename.substring(0, 25)}...` : generatedPDF.filename}
							</div>
							<div className="flex items-center gap-2 text-xs text-dim-2">
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
