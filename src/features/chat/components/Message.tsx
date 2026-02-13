import { FunctionComponent } from 'preact';
import { memo } from 'preact/compat';
import { FileAttachment, MessageReaction } from '../../../../worker/types';
import type { IntakePaymentRequest } from '@/shared/utils/intakePayments';
import { AIThinkingIndicator } from './AIThinkingIndicator';
import { MessageBubble } from './MessageBubble';
import { MessageAvatar } from './MessageAvatar';
import { MessageContent } from './MessageContent';
import { MessageAttachments } from './MessageAttachments';
import { MessageActions } from './MessageActions';
import type { ReplyTarget } from '@/features/chat/types';
import { ArrowUturnLeftIcon } from '@heroicons/react/24/outline';
import { formatRelativeTime } from '@/features/matters/utils/formatRelativeTime';
import { chatTypography } from '@/features/chat/styles/chatTypography';
import type { IntakeConversationState } from '@/shared/types/intake';

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
	leadReview?: {
		canReview: boolean;
		isSubmitting?: boolean;
		onAccept: () => void;
		onReject: () => void;
	};
	replyPreview?: ReplyTarget;
	reactions?: MessageReaction[];
	onReplyPreviewClick?: () => void;
	onReply?: () => void;
	onToggleReaction?: (emoji: string) => void;
	practiceConfig?: {
		name: string;
		profileImage: string | null;
		practiceId: string;
	};
	onOpenSidebar?: () => void;
	onOpenPayment?: (request: IntakePaymentRequest) => void;
	isLoading?: boolean;
	toolMessage?: string;
	id?: string;
	practiceId?: string;
	intakeStatus?: {
		step?: string;
		decision?: string;
		intakeUuid?: string | null;
		paymentRequired?: boolean;
		paymentReceived?: boolean;
	};
	intakeConversationState?: IntakeConversationState | null;
	showIntakeCta?: boolean;
	onIntakeCtaResponse?: (response: 'ready' | 'not_yet') => void;
	onSubmitNow?: () => void | Promise<void>;
	showIntakeDecisionPrompt?: boolean;
	onBuildBrief?: () => void;
	quickReplies?: string[];
	onQuickReply?: (text: string) => void;
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
	intakeStatus,
	documentChecklist,
	generatedPDF,
	paymentRequest,
	practiceConfig: _practiceConfig,
	onOpenSidebar: _onOpenSidebar,
	onOpenPayment,
	modeSelector,
	assistantRetry,
	authCta,
	onAuthPromptRequest,
	leadReview,
	replyPreview,
	reactions = [],
	onReplyPreviewClick,
	onReply,
	onToggleReaction,
	isLoading,
	toolMessage,
	id: _id,
	practiceId: _practiceId,
	className = '',
	intakeConversationState,
	showIntakeCta,
	onIntakeCtaResponse,
	onSubmitNow,
	showIntakeDecisionPrompt,
	onBuildBrief,
	quickReplies,
	onQuickReply
}) => {
	const hasContent = Boolean(content);
	const isStreaming = false; // No streaming for user-to-user chat
	const shouldShowIndicator = isLoading && !hasContent;
	
	const hasOnlyMedia = files.length > 0 && !content && files.every(file => 
		file.type.startsWith('image/') || 
		file.type.startsWith('video/') || 
		file.type.startsWith('audio/')
	);

	const messageAvatar = avatar;
	const showHeader = Boolean(authorName || timestamp);
	const contentClassName = showHeader ? 'mt-1' : '';
	const formattedTime = timestamp
		? formatRelativeTime(new Date(timestamp).toISOString())
		: null;

	// Avatar size based on message size
	const avatarSize = size === 'sm' ? 'sm' : 'lg';
	const quickReactions = ['👍', '👀', '😂', '❤️'];
	const showActions = Boolean(onReply || onToggleReaction);
	const hasReactions = reactions.length > 0;
	const hasReplyPreview = Boolean(replyPreview);
	const wrapperClassName = [
		'relative flex items-start gap-3 mb-2 last:mb-0',
		'px-3 py-2 rounded-md group transition-colors duration-150 hover:bg-white/5',
		className
	].filter(Boolean).join(' ');

	return (
		<div
			id={_id ? `message-${_id}` : undefined}
			data-message-id={_id}
			className={wrapperClassName}
		>
			{/* Avatar */}
			{messageAvatar && (
				<MessageAvatar
					src={messageAvatar.src}
					name={messageAvatar.name}
					size={avatarSize}
					className={`flex-shrink-0 ${hasReplyPreview ? 'mt-4' : ''}`}
				/>
			)}

			{showActions && (
				<div className="absolute right-3 top-0 z-10 hidden -translate-y-1/2 items-center gap-1 rounded-md border border-white/10 bg-black/40 px-1 py-0.5 opacity-0 backdrop-blur-sm transition-opacity duration-150 group-hover:flex group-hover:opacity-100 group-focus-within:flex group-focus-within:opacity-100">
					{onToggleReaction && quickReactions.map((emoji) => (
						<button
							key={emoji}
							type="button"
							className="flex h-6 w-6 items-center justify-center rounded text-sm text-gray-200 transition hover:bg-white/10"
							aria-label={`React with ${emoji}`}
							onClick={() => onToggleReaction(emoji)}
						>
							{emoji}
						</button>
					))}
					{onReply && (
						<button
							type="button"
							className="flex h-6 w-6 items-center justify-center rounded text-gray-200 transition hover:bg-white/10"
							aria-label="Reply to message"
							onClick={onReply}
						>
							<ArrowUturnLeftIcon className="h-4 w-4" />
						</button>
					)}
				</div>
			)}
			
			{/* Message Bubble */}
			<MessageBubble
				isUser={isUser}
				variant={variant}
				hasOnlyMedia={hasOnlyMedia}
			>
				{hasReplyPreview && replyPreview && (
					<button
						type="button"
						className={`relative flex min-w-0 items-center gap-2 pl-7 text-left text-xs text-gray-400 ${onReplyPreviewClick ? 'cursor-pointer transition hover:text-gray-300' : 'cursor-default pointer-events-none'}`}
						onClick={onReplyPreviewClick}
						disabled={!onReplyPreviewClick}
						aria-label="Jump to replied message"
					>
						<span className="pointer-events-none absolute left-[-32px] top-1/2 h-[14px] w-[60px] -translate-y-1/2 rounded-tl-lg border-l-2 border-t border-gray-600/70" />
						{replyPreview.avatar && (
							<MessageAvatar
								src={replyPreview.avatar.src}
								name={replyPreview.avatar.name}
								size="xs"
								className="flex-shrink-0 mt-0.5 relative z-10"
							/>
						)}
						<span className="font-semibold text-gray-200">{replyPreview.authorName}</span>
						<span className="truncate text-gray-500">
							{replyPreview.isMissing ? 'Original message unavailable' : replyPreview.content}
						</span>
					</button>
				)}
				{showHeader && (
					<div className="mt-1 flex min-w-0 items-baseline justify-between gap-3 text-left">
						{(authorName || messageAvatar?.name) && (
							<span className={`min-w-0 truncate leading-none ${chatTypography.headerName}`}>
								{authorName || messageAvatar?.name}
							</span>
						)}
						{formattedTime && (
							<span className={`flex-shrink-0 ${chatTypography.headerTime}`}>
								{formattedTime}
							</span>
						)}
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
					intakeStatus={intakeStatus}
					documentChecklist={documentChecklist}
					generatedPDF={generatedPDF}
					paymentRequest={paymentRequest}
					onOpenPayment={onOpenPayment}
					modeSelector={modeSelector}
					assistantRetry={assistantRetry}
					authCta={authCta}
					onAuthPromptRequest={onAuthPromptRequest}
					leadReview={leadReview}
				intakeConversationState={intakeConversationState}
				quickReplies={quickReplies}
				onQuickReply={onQuickReply}
				showIntakeCta={showIntakeCta}
				onIntakeCtaResponse={onIntakeCtaResponse}
				onSubmitNow={onSubmitNow}
				showIntakeDecisionPrompt={showIntakeDecisionPrompt}
				onBuildBrief={onBuildBrief}
			/>
				
				{/* Attachments */}
				{files.length > 0 && (
					<MessageAttachments
						files={files}
					/>
				)}

				{hasReactions && (
					<div className="mt-2 flex flex-wrap gap-2">
						{reactions.map((reaction) => (
							<button
								key={reaction.emoji}
								type="button"
								className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition ${
									reaction.reactedByMe
										? 'border-blue-400/40 bg-blue-500/20 text-blue-100'
										: 'border-white/10 bg-white/5 text-gray-200 hover:bg-white/10'
								}`}
								aria-label={`React with ${reaction.emoji}`}
								onClick={() => onToggleReaction?.(reaction.emoji)}
							>
								<span className="text-sm">{reaction.emoji}</span>
								<span className="text-xs text-gray-300">{reaction.count}</span>
							</button>
						))}
					</div>
				)}
			</MessageBubble>
		</div>
	);
});

export default Message;
