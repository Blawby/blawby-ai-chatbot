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
import { useNavigation } from '@/shared/utils/navigation';

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

	intakeConversationState?: IntakeConversationState | null;
	actions?: ChatMessageAction[];
	onActionReply?: (text: string) => void;
	onSubmitNow?: () => void | Promise<void>;
	onBuildBrief?: () => void;
	onStrengthenCase?: () => void;
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
	intakeStatus,
	documentChecklist,
	generatedPDF,
	paymentRequest,
	modeSelector,
	assistantRetry,
	authCta,
	onAuthPromptRequest,
	intakeConversationState: _intakeConversationState,
	actions,
	onActionReply,
	onSubmitNow,
	onBuildBrief,
	onStrengthenCase,
	onboardingProfile,
	isStreaming = false,
	isLast,
	className = ''
}) => {
	const { showSuccess, showInfo } = useToastContext();
	const { t } = useTranslation('common');
	const { navigate } = useNavigation();
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
				return Boolean(paymentRequest?.paymentLinkUrl);
			case 'open_url':
				return true;
			case 'build_brief':
				return Boolean(onBuildBrief);
			case 'strengthen_case':
				return Boolean(onStrengthenCase);
		}
	});


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
			{isLast && !isStreaming && renderableActions.length > 0 && (
				<div className="mt-3 flex gap-2 overflow-x-auto pb-1">
					{renderableActions.map((action, idx) => (
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
								const isSameOrigin = (urlStr: string) => {
									try {
										const url = new URL(urlStr, window.location.origin);
										return url.origin === window.location.origin;
									} catch { return false; }
								};
								
								const sameOrigin = isSameOrigin(action.url);
								
								return (
									<a
										key={getChatActionKey(action, idx)}
										href={action.url}
										target={sameOrigin ? undefined : "_blank"}
										rel={sameOrigin ? undefined : "noopener noreferrer"}
										className={`btn ${action.variant === 'primary' ? 'btn-primary' : 'btn-secondary'} btn-sm shrink-0 no-underline inline-flex items-center justify-center px-4 rounded-xl font-semibold transition-all hover:opacity-90 active:scale-[0.98] h-8 text-xs`}
										onClick={(e) => {
											try {
												const parsed = new URL(action.url, window.location.origin);
												if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
													e.preventDefault();
													console.warn('[MessageActions] Blocked unsafe URL protocol:', parsed.protocol);
													showInfo('Link Cannot Open', `This link uses an unsafe protocol: ${parsed.protocol}`);
													return;
												}
												
												if (parsed.origin === window.location.origin) {
													e.preventDefault();
													navigate(`${parsed.pathname}${parsed.search}${parsed.hash}`);
												}
											} catch {
												e.preventDefault();
												console.warn('[MessageActions] Invalid URL format:', action.url);
												showInfo('Invalid Link', `Cannot open link with invalid URL format: ${action.url}`);
											}
										}}
									>
										{action.label}
									</a>
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
						) : action.type === 'strengthen_case' ? (
							onStrengthenCase ? (
								<Button
									key={getChatActionKey(action, idx)}
									variant={action.variant === 'primary' ? 'primary' : 'secondary'}
									size="sm"
									className="shrink-0"
									onClick={() => onStrengthenCase()}
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
					<div className="flex items-center gap-2 p-3 rounded-lg glass-panel">
						<div className="w-8 h-8 rounded bg-surface-utility/60 dark:bg-surface-utility/10 flex items-center justify-center flex-shrink-0">
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
