import { FunctionComponent } from 'preact';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { useTranslation } from '@/shared/i18n/hooks';
import { ContactForm, ContactData } from '@/features/intake/components/ContactForm';
import type { Address } from '@/shared/types/address';
import { IntakePaymentCard } from '@/features/intake/components/IntakePaymentCard';
import type { IntakePaymentRequest } from '@/shared/utils/intakePayments';
import DocumentChecklist from '@/features/intake/components/DocumentChecklist';
import MatterCanvas from '@/features/matters/components/MatterCanvas';
import { DocumentIcon } from "@heroicons/react/24/outline";
import { formatDocumentIconSize } from '@/features/chat/utils/fileUtils';
import { Button } from '@/shared/ui/Button';

interface MessageActionsProps {
	matterCanvas?: {
		matterId?: string;
		matterNumber?: string;
		service: string;
		matterSummary: string;
		answers?: Record<string, string>;
		isExpanded?: boolean;
	};
	contactForm?: {
		fields: string[];
		required: string[];
		message?: string;
		initialValues?: {
			name?: string;
			email?: string;
			phone?: string;
			address?: Partial<Address>;
			opposingParty?: string;
		};
	};
	contactFormVariant?: 'card' | 'plain';
	contactFormFormId?: string;
	showContactFormSubmit?: boolean;
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
	};
	onContactFormSubmit?: (data: ContactData) => void | Promise<void>;
	className?: string;
}

export const MessageActions: FunctionComponent<MessageActionsProps> = ({
	matterCanvas,
	contactForm,
	contactFormVariant,
	contactFormFormId,
	showContactFormSubmit,
	intakeStatus,
	documentChecklist,
	generatedPDF,
	paymentRequest,
	onOpenPayment,
	onContactFormSubmit,
	modeSelector,
	assistantRetry,
	authCta,
	onAuthPromptRequest,
	leadReview,
	className = ''
}) => {
	const { showSuccess, showInfo } = useToastContext();
	const { t } = useTranslation('auth');

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
			{authCta?.label && onAuthPromptRequest && (
				<div className="mt-3">
					<Button variant="primary" size="sm" onClick={onAuthPromptRequest}>
						{authCta.label}
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
						</div>
					) : (
						<div className="text-xs text-gray-500 dark:text-gray-400">
							{t('leadReview.noPermission')}
						</div>
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
			
			{/* Display contact form only if intake is still in contact_form step */}
			{contactForm && onContactFormSubmit && !paymentRequest && (!intakeStatus || intakeStatus.step === 'contact_form') && (
				<ContactForm
					fields={contactForm.fields}
					required={contactForm.required}
					message={contactForm.message}
					initialValues={contactForm.initialValues}
					onSubmit={onContactFormSubmit}
					variant={contactFormVariant}
					formId={contactFormFormId}
					showSubmitButton={showContactFormSubmit}
				/>
			)}

			{paymentRequest && (
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
						<div className="w-8 h-8 rounded bg-surface-base flex items-center justify-center flex-shrink-0">
							<DocumentIcon className="w-4 h-4 text-gray-600 dark:text-gray-400" />
						</div>
						<div className="flex-1 min-w-0">
							<div className="text-sm font-medium text-input-text whitespace-nowrap overflow-hidden text-ellipsis" title={generatedPDF.filename}>
								{generatedPDF.filename.length > 25 ? `${generatedPDF.filename.substring(0, 25)}...` : generatedPDF.filename}
							</div>
							<div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
								<span>{formatDocumentIconSize(generatedPDF.size)}</span>
								{generatedPDF.generatedAt && (
									<span>• {new Date(generatedPDF.generatedAt).toLocaleDateString()}</span>
								)}
							</div>
						</div>
							{generatedPDF.storageKey && (
								<button
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
								className="px-3 py-1 text-xs font-medium text-accent-600 dark:text-accent-400 hover:text-accent-700 dark:hover:text-accent-300 transition-colors"
								aria-label={`Download ${generatedPDF.filename}`}
							>
								Download
							</button>
						)}
					</div>
				</div>
			)}
		</div>
	);
};
