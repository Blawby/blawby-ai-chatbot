import { FunctionComponent } from 'preact';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { ContactForm, ContactData } from '@/features/intake/components/ContactForm';
import DocumentChecklist from '@/features/intake/components/DocumentChecklist';
import LawyerSearchResults from '@/features/lawyer-search/components/LawyerSearchResults';
import MatterCanvas from '@/features/matters/components/MatterCanvas';
import { DocumentIcon } from "@heroicons/react/24/outline";
import { formatDocumentIconSize } from '@/features/chat/utils/fileUtils';

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
			location?: string;
			opposingParty?: string;
		};
	};
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
	lawyerSearchResults?: {
		matterType: string;
		lawyers: Array<{
			id: string;
			name: string;
			firm?: string;
			location: string;
			practiceAreas: string[];
			rating?: number;
			reviewCount?: number;
			phone?: string;
			email?: string;
			website?: string;
			bio?: string;
			experience?: string;
			languages?: string[];
			consultationFee?: number;
			availability?: string;
		}>;
		total: number;
	};
	generatedPDF?: {
		filename: string;
		size: number;
		generatedAt: string;
		matterType: string;
		storageKey?: string;
	};
	onContactFormSubmit?: (data: ContactData) => void | Promise<void>;
	className?: string;
}

export const MessageActions: FunctionComponent<MessageActionsProps> = ({
	matterCanvas,
	contactForm,
	documentChecklist,
	lawyerSearchResults,
	generatedPDF,
	onContactFormSubmit,
	className = ''
}) => {
	const { showSuccess, showInfo } = useToastContext();

	return (
		<div className={className}>
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
			
			{/* Display contact form */}
			{contactForm && onContactFormSubmit && (
				<ContactForm
					fields={contactForm.fields}
					required={contactForm.required}
					message={contactForm.message}
					initialValues={contactForm.initialValues}
					onSubmit={onContactFormSubmit}
				/>
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

			{/* Display lawyer search results */}
			{lawyerSearchResults && (
				<LawyerSearchResults
					matterType={lawyerSearchResults.matterType}
					lawyers={lawyerSearchResults.lawyers}
					total={lawyerSearchResults.total}
					onContactLawyer={(lawyer) => {
						if (lawyer.phone) {
							globalThis.open(`tel:${lawyer.phone}`, '_self');
						} else if (lawyer.email) {
							globalThis.open(`mailto:${lawyer.email}?subject=Legal Consultation Request`, '_self');
						} else if (lawyer.website) {
							globalThis.open(lawyer.website, '_blank');
						} else {
							showInfo('Contact Information', `Contact ${lawyer.name} at ${lawyer.firm || 'their firm'} for a consultation.`);
						}
					}}
					onSearchAgain={() => {
						showInfo('New Search', 'Please ask the AI to search for lawyers again with different criteria.');
					}}
				/>
			)}

			{/* Display generated PDF */}
			{generatedPDF && (
				<div className="my-2">
					<div className="flex items-center gap-2 p-3 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
						<div className="w-8 h-8 rounded bg-gray-100 dark:bg-dark-hover flex items-center justify-center flex-shrink-0">
							<DocumentIcon className="w-4 h-4 text-gray-600 dark:text-gray-400" />
						</div>
						<div className="flex-1 min-w-0">
							<div className="text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap overflow-hidden text-ellipsis" title={generatedPDF.filename}>
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
									const downloadUrl = generatedPDF.storageKey!.startsWith('http') 
										? generatedPDF.storageKey! 
										: `/api/files/${generatedPDF.storageKey}`;
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
