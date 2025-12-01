import { FunctionComponent } from 'preact';
import { memo } from 'preact/compat';
import { FileAttachment } from '../../../worker/types';
import { ContactData } from '../ContactForm';
import { AIThinkingIndicator } from '../AIThinkingIndicator';
import { MessageBubble } from './atoms/MessageBubble';
import { MessageAvatar } from './atoms/MessageAvatar';
import { MessageContent } from './molecules/MessageContent';
import { MessageAttachments } from './molecules/MessageAttachments';
import { MessageActions } from './molecules/MessageActions';

interface MessageProps {
	content: string;
	isUser: boolean;
	files?: FileAttachment[];
	// Avatar props
	avatar?: {
		src?: string | null;
		name: string;
	};
	// Variant and size
	variant?: 'default' | 'compact' | 'detailed';
	size?: 'sm' | 'md' | 'lg';
	// Action props
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
	toolMessage?: string;
	// Feedback props
	id?: string;
	sessionId?: string;
	practiceId?: string;
	showFeedback?: boolean;
	onFeedbackSubmit?: (feedback: { rating: number; comment?: string }) => void;
	// Styling
	className?: string;
}

const Message: FunctionComponent<MessageProps> = memo(({ 
	content, 
	isUser, 
	files = [],
	avatar,
	variant = 'default',
	size = 'md',
	matterCanvas,
	contactForm,
	documentChecklist,
	lawyerSearchResults,
	generatedPDF,
	practiceConfig: _practiceConfig,
	onOpenSidebar: _onOpenSidebar,
	onContactFormSubmit,
	isLoading,
	toolMessage,
	id: _id,
	sessionId: _sessionId,
	practiceId: _practiceId,
	showFeedback: _showFeedback = true,
	onFeedbackSubmit: _onFeedbackSubmit,
	className = ''
}) => {
	const hasContent = Boolean(content);
	const isStreaming = false; // No streaming for user-to-user chat
	const shouldShowIndicator = isLoading && !hasContent;
	
	const hasOnlyMedia = files.length > 0 && !content && files.every(file => 
		file.type.startsWith('image/') || 
		file.type.startsWith('video/') || 
		file.type.startsWith('audio/')
	);

	// Determine avatar - use provided avatar, or fall back to practiceConfig for assistant messages
	const messageAvatar = avatar || (!isUser && _practiceConfig ? {
		src: _practiceConfig.profileImage,
		name: _practiceConfig.name
	} : undefined);

	// Avatar size based on message size
	const avatarSize = size === 'sm' ? 'sm' : size === 'lg' ? 'lg' : 'md';

	return (
		<div className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'} ${className}`}>
			{/* Avatar */}
			{messageAvatar && (
				<MessageAvatar
					src={messageAvatar.src}
					name={messageAvatar.name}
					size={avatarSize}
					className="mt-1"
				/>
			)}
			
			{/* Message Bubble */}
			<MessageBubble
				isUser={isUser}
				variant={variant}
				hasOnlyMedia={hasOnlyMedia}
			>
				{/* Content */}
				{hasContent && (
					<MessageContent
						content={content}
						isStreaming={isStreaming}
						isUser={isUser}
						variant={variant}
						size={size}
					/>
				)}
				
				{/* Loading Indicator */}
				{shouldShowIndicator && (
					<AIThinkingIndicator 
						variant="thinking" 
						toolMessage={toolMessage}
					/>
				)}
				
				{/* Actions (matter canvas, forms, etc.) */}
				<MessageActions
					matterCanvas={matterCanvas}
					contactForm={contactForm}
					documentChecklist={documentChecklist}
					lawyerSearchResults={lawyerSearchResults}
					generatedPDF={generatedPDF}
					onContactFormSubmit={onContactFormSubmit}
				/>
				
				{/* Attachments */}
				{files.length > 0 && (
					<MessageAttachments
						files={files}
						variant={variant}
					/>
				)}
			</MessageBubble>
		</div>
	);
});

export default Message;
