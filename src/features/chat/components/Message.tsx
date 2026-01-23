import { FunctionComponent } from 'preact';
import { memo } from 'preact/compat';
import { FileAttachment } from '../../../../worker/types';
import { ContactData } from '@/features/intake/components/ContactForm';
import type { IntakePaymentRequest } from '@/shared/utils/intakePayments';
import { AIThinkingIndicator } from './AIThinkingIndicator';
import { MessageBubble } from './MessageBubble';
import { MessageAvatar } from './MessageAvatar';
import { MessageContent } from './MessageContent';
import { MessageAttachments } from './MessageAttachments';
import { MessageActions } from './MessageActions';

interface MessageProps {
	content: string;
	isUser: boolean;
	files?: FileAttachment[];
	// Avatar props
	avatar?: {
		src?: string | null;
		name: string;
	};
	authorName?: string;
	timestamp?: number;
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
	};
	assistantRetry?: {
		label?: string;
		status?: 'error' | 'retrying';
		onRetry?: () => void;
	};
	practiceConfig?: {
		name: string;
		profileImage: string | null;
		practiceId: string;
	};
	onOpenSidebar?: () => void;
	onContactFormSubmit?: (data: ContactData) => void | Promise<void>;
	onOpenPayment?: (request: IntakePaymentRequest) => void;
	isLoading?: boolean;
	toolMessage?: string;
	id?: string;
	practiceId?: string;
	// Styling
	className?: string;
}

const Message: FunctionComponent<MessageProps> = memo(({ 
	content, 
	isUser, 
	files = [],
	avatar,
	authorName,
	timestamp,
	variant = 'default',
	size = 'md',
	matterCanvas,
	contactForm,
	documentChecklist,
	generatedPDF,
	paymentRequest,
	practiceConfig: _practiceConfig,
	onOpenSidebar: _onOpenSidebar,
	onContactFormSubmit,
	onOpenPayment,
	modeSelector,
	assistantRetry,
	isLoading,
	toolMessage,
	id: _id,
	practiceId: _practiceId,
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

	// Avatar is resolved by the message list to keep sender rules in one place.
	const messageAvatar = avatar;
	const showHeader = Boolean(authorName || timestamp);
	const contentClassName = showHeader ? 'mt-1' : '';
	const formattedTime = timestamp
		? new Date(timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
		: null;

	// Avatar size based on message size
	const avatarSize = size === 'sm' ? 'sm' : 'lg';

	return (
		<div className={`flex items-start gap-3 px-3 py-2 mb-2 last:mb-0 rounded-md transition-colors duration-150 hover:bg-white/5 ${className}`}>
			{/* Avatar */}
			{messageAvatar && (
				<MessageAvatar
					src={messageAvatar.src}
					name={messageAvatar.name}
					size={avatarSize}
					className="flex-shrink-0"
				/>
			)}
			
			{/* Message Bubble */}
			<MessageBubble
				isUser={isUser}
				variant={variant}
				hasOnlyMedia={hasOnlyMedia}
			>
				{showHeader && (
					<div className="flex items-baseline gap-2 justify-start text-left">
						<span className="text-base font-semibold text-gray-100 leading-none">
							{authorName || messageAvatar?.name}
						</span>
						{formattedTime && <span className="text-xs font-normal text-gray-500">{formattedTime}</span>}
					</div>
				)}
				{/* Content */}
				{hasContent && (
					<MessageContent
						content={content}
						isStreaming={isStreaming}
						isUser={isUser}
						variant={variant}
						size={size}
						className={contentClassName}
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
					generatedPDF={generatedPDF}
					paymentRequest={paymentRequest}
					onOpenPayment={onOpenPayment}
					onContactFormSubmit={onContactFormSubmit}
					modeSelector={modeSelector}
					assistantRetry={assistantRetry}
				/>
				
				{/* Attachments */}
				{files.length > 0 && (
					<MessageAttachments
						files={files}
					/>
				)}
			</MessageBubble>
		</div>
	);
});

export default Message;
