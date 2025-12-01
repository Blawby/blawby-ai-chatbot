import { FunctionComponent } from 'preact';
import { memo } from 'preact/compat';
import { useState } from 'preact/hooks';
import {
	DocumentIcon,
	TableCellsIcon,
	MusicalNoteIcon,
	VideoCameraIcon
} from "@heroicons/react/24/outline";
import { FileAttachment } from '../../worker/types';
import { useToastContext } from '../contexts/ToastContext';
import { AIThinkingIndicator } from './AIThinkingIndicator';
import { ContactForm, ContactData } from './ContactForm';
import DocumentChecklist from './DocumentChecklist';
import LawyerSearchResults from './LawyerSearchResults';
import LazyMedia from './LazyMedia';
import MatterCanvas from './MatterCanvas';
import MediaContent from './MediaContent';
import Modal from './Modal';
import ChatMarkdown from './ChatMarkdown';



interface MessageProps {
	content: string;
	isUser: boolean;
	files?: FileAttachment[];
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
	practiceConfig?: {
		name: string;
		profileImage: string | null;
		practiceId: string;
	};
	onOpenSidebar?: () => void;
	onContactFormSubmit?: (data: ContactData) => void | Promise<void>;
	isLoading?: boolean;
	// REMOVED: aiState - AI functionality removed, will be replaced with user-to-user chat
	// aiState?: 'thinking' | 'processing' | 'generating';
	toolMessage?: string;
	// Feedback props
	id?: string;
	sessionId?: string;
	practiceId?: string;
	showFeedback?: boolean;
	onFeedbackSubmit?: (feedback: { rating: number; comment?: string }) => void;
}

const formatDocumentIconSize = (bytes: number): string => {
	if (bytes === 0) return '0 B';
	const k = 1024;
	const sizes = ['B', 'KB', 'MB', 'GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

const getDocumentIcon = (file: FileAttachment) => {
	// Get file extension
			const ext = file.name.split('.').pop()?.toLowerCase();
	
	// PDF icon
	if (file.type === 'application/pdf' || ext === 'pdf') {
		return (
			<DocumentIcon className="w-4 h-4 text-gray-600 dark:text-gray-400" />
		);
	}

	// Word document icon
	if (file.type === 'application/msword' ||
		file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
		ext === 'doc' || ext === 'docx') {
		return (
			<DocumentIcon className="w-4 h-4 text-gray-600 dark:text-gray-400" />
		);
	}

	// Excel spreadsheet icon
	if (file.type === 'application/vnd.ms-excel' ||
		file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
		ext === 'xls' || ext === 'xlsx' || ext === 'csv') {
		return (
			<TableCellsIcon className="w-4 h-4 text-gray-600 dark:text-gray-400" />
		);
	}

	// Audio file icon
	if (file.type.startsWith('audio/')) {
		return (
			<MusicalNoteIcon className="w-4 h-4 text-gray-600 dark:text-gray-400" />
		);
	}

	// Video file icon
	if (file.type.startsWith('video/')) {
		return (
			<VideoCameraIcon className="w-4 h-4 text-gray-600 dark:text-gray-400" />
		);
	}

	// Default file icon
	return (
		<DocumentIcon className="w-4 h-4 text-gray-600 dark:text-gray-400" />
	);
};

const DocumentIconPreview: FunctionComponent<{ file: FileAttachment; onDocumentIconClick: (file: FileAttachment) => void }> = ({ file, onDocumentIconClick }) => {
	const handleKeyDown = (e: globalThis.KeyboardEvent) => {
		if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
			e.preventDefault();
			onDocumentIconClick(file);
		}
	};

	return (
		<div 
			className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 cursor-pointer my-2 max-w-[300px]"
			onClick={() => onDocumentIconClick(file)}
			onKeyDown={handleKeyDown}
			role="button"
			tabIndex={0}
			aria-label={`Open ${file.name}`}
		>
			<div className="w-8 h-8 rounded bg-gray-100 dark:bg-dark-hover flex items-center justify-center flex-shrink-0">
				{getDocumentIcon(file)}
			</div>
			<div className="flex-1 min-w-0">
				<div className="text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap overflow-hidden text-ellipsis" title={file.name}>
					{file.name.length > 25 ? `${file.name.substring(0, 25)}...` : file.name}
				</div>
				<div className="text-xs text-gray-500 dark:text-gray-400">{formatDocumentIconSize(file.size)}</div>
			</div>
		</div>
	);
};

const ImagePreview: FunctionComponent<{ file: FileAttachment; onImageClick: (file: FileAttachment) => void }> = ({ file, onImageClick }) => {
	return (
		<div className="message-media-container my-2">
			<LazyMedia
				src={file.url}
				type={file.type}
				alt={file.name}
				className="max-w-[300px] max-h-[300px] w-auto h-auto block cursor-pointer rounded-lg border border-gray-200 dark:border-gray-700"
				onClick={() => onImageClick(file)}
			/>
		</div>
	);
};

// Agent handles service selection - no component needed

// Agent handles urgency selection - no component needed

// Agent handles welcome messages - no component needed

const Message: FunctionComponent<MessageProps> = memo(({ 
	content, 
	isUser, 
	files = [], 
	matterCanvas,
	contactForm,
	documentChecklist,
	lawyerSearchResults,
	generatedPDF,
	practiceConfig: _practiceConfig,
	onOpenSidebar: _onOpenSidebar,
	onContactFormSubmit,
	isLoading,
	// REMOVED: aiState - AI functionality removed
	// aiState,
	toolMessage,
	id: _id,
	sessionId: _sessionId,
	practiceId: _practiceId,
	showFeedback: _showFeedback = true,
	onFeedbackSubmit: _onFeedbackSubmit
}) => {
	const { showSuccess, showInfo } = useToastContext();
	const [isModalOpen, setIsModalOpen] = useState(false);
	const [selectedMedia, setSelectedMedia] = useState<{
		id: string;
		name: string;
		size: number;
		type: string;
		url: string;
		timestamp: Date;
		messageIndex: number;
		category: 'image' | 'video' | 'audio';
	} | null>(null);
	const imageDocumentIcons = files.filter(file => file.type.startsWith('image/'));
	const audioDocumentIcons = files.filter(file => file.type.startsWith('audio/'));
	const videoDocumentIcons = files.filter(file => file.type.startsWith('video/'));
	const otherDocumentIcons = files.filter(file => 
		!file.type.startsWith('image/') && 
		!file.type.startsWith('audio/') && 
		!file.type.startsWith('video/')
	);
	
	const hasOnlyMedia = files.length > 0 && !content && files.every(file => 
		file.type.startsWith('image/') || 
		file.type.startsWith('video/') || 
		file.type.startsWith('audio/')
	);



	const hasContent = Boolean(content);
	// REMOVED: AI streaming state - AI functionality removed
	// const isStreaming = isLoading && hasContent && aiState === 'generating';
	const isStreaming = false; // No streaming for user-to-user chat
	const shouldShowIndicator = isLoading && !hasContent;

	return (
		<div className={`flex flex-col max-w-full my-4 px-3 py-2 rounded-xl break-words relative ${
			isUser 
				? 'ml-auto mr-0 bg-light-message-bg-user dark:bg-dark-message-bg-user text-light-text dark:text-dark-text w-fit' 
				: 'mr-0 ml-0 w-full min-h-12 min-w-30'
		} ${hasOnlyMedia ? 'p-0 m-0 bg-none' : ''}`} data-testid={isUser ? "user-message" : "ai-message"}>
			{/* Agent handles welcome messages - no special logic needed */}
			<div className="text-base leading-6 min-h-4">
				{/* Show message content as soon as it exists */}
				{hasContent && (
					<>
						{/* Special styling for analysis status messages */}
						{!isUser && (content.includes('📄 Analyzing document') || content.includes('🔍')) ? (
							<div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-3 py-2 rounded-lg border border-blue-200 dark:border-blue-800">
								<div className="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full" role="status" aria-live="polite">
									<span className="sr-only">Loading…</span>
								</div>
								<ChatMarkdown text={content} isStreaming={isStreaming} />
							</div>
						) : (
							<ChatMarkdown text={content} isStreaming={isStreaming} />
						)}
					</>
				)}
				
				{/* REMOVED: AI thinking indicator - AI functionality removed */}
				{shouldShowIndicator && (
					<AIThinkingIndicator 
						variant="thinking" 
						toolMessage={toolMessage}
					/>
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
							// Handle document upload
							if (file) {
								// In a real implementation, this would upload to a file service
								showSuccess('Document Uploaded', `Document "${file.name}" uploaded successfully for ${documentId}`);
							}
						}}
						onDocumentRemove={(documentId) => {
							// Handle document removal
							showInfo('Document Removed', `Document ${documentId} removed from checklist`);
						}}
						onComplete={() => {
							// Handle checklist completion
							showSuccess('Checklist Complete', 'Document checklist completed! You can now proceed with your case.');
						}}
						onSkip={() => {
							// Handle checklist skip
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
							// Open lawyer contact options
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
							// Trigger new lawyer search
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
										// Construct download URL from storageKey
										// If storageKey is already a full URL, use it directly; otherwise construct it
										const downloadUrl = generatedPDF.storageKey.startsWith('http') 
											? generatedPDF.storageKey 
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

				
				{/* Agent handles all matter creation and welcome messages - no components needed */}
				
				{/* Display files */}
				{imageDocumentIcons.map((file, index) => (
					<ImagePreview 
						key={file.url || index} 
						file={file} 
						onImageClick={(file) => {
							setSelectedMedia({
								id: file.url,
								name: file.name,
								size: file.size,
								type: file.type,
								url: file.url,
								timestamp: new Date(),
								messageIndex: 0,
								category: 'image' as const
							});
							setIsModalOpen(true);
						}}
					/>
				))}
				
				{otherDocumentIcons.map((file, index) => (
					<DocumentIconPreview 
						key={`other-${index}`} 
						file={file} 
						onDocumentIconClick={(file) => {
							// For documents and other files, trigger download
							const link = globalThis.document.createElement('a');
							link.href = file.url;
							link.download = file.name;
							link.click();
						}}
					/>
				))}
				{audioDocumentIcons.map((file, index) => (
					<div key={`audio-${index}`} className="my-2 rounded-xl overflow-hidden max-w-75 w-full">
						<LazyMedia
							src={file.url}
							type={file.type}
							alt={file.name}
							className="w-full h-auto block cursor-pointer"
						/>
					</div>
				))}
				{videoDocumentIcons.map((file, index) => (
					<div key={`video-${index}`} className="my-2 rounded-xl overflow-hidden max-w-75 w-full">
						<LazyMedia
							src={file.url}
							type={file.type}
							alt={file.name}
							className="w-full h-auto block cursor-pointer"
						/>
					</div>
				))}
				
				{/* Modal for viewing images */}
				{isModalOpen && selectedMedia && (
					<Modal
						isOpen={isModalOpen}
						onClose={() => {
							setIsModalOpen(false);
							setSelectedMedia(null);
						}}
						type="fullscreen"
						showCloseButton={true}
					>
						<MediaContent media={selectedMedia} />
					</Modal>
				)}
			</div>
		</div>
	);
});

export default Message; 
