import { FunctionComponent } from 'preact';
import { memo } from 'preact/compat';
import { useCallback } from 'preact/hooks';
import { FileAttachment, MessageReaction } from '../../../../worker/types';
import type { IntakePaymentRequest } from '@/shared/utils/intakePayments';
import { AIThinkingIndicator } from './AIThinkingIndicator';
import { MessageBubble } from './MessageBubble';
import { MessageAvatar } from './MessageAvatar';
import { MessageContent } from './MessageContent';
import { MessageAttachments } from './MessageAttachments';
import { MessageActions } from './MessageActions';
import ConversationEventRow from './ConversationEventRow';
import type { ReplyTarget } from '@/features/chat/types';
import { Undo2 } from 'lucide-preact';

import { Icon } from '@/shared/ui/Icon';
import { formatRelativeTime } from '@/features/matters/utils/formatRelativeTime';
import { chatTypography } from '@/features/chat/styles/chatTypography';
import type { ChatMessageAction } from '@/shared/types/conversation';
import { features } from '@/config/features';

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
	replyPreview?: ReplyTarget;
	reactions?: MessageReaction[];
	onReplyPreviewClick?: () => void;
	onReply?: (target: ReplyTarget) => void;
	onToggleReaction?: (messageId: string, emoji: string) => void;
	practiceConfig?: {
		name: string;
		profileImage: string | null;
		practiceId: string;
	};
	onOpenSidebar?: () => void;
	isStreaming?: boolean;
	isLoading?: boolean;
	toolMessage?: string;
	id?: string;
	practiceId?: string;
	actions?: ChatMessageAction[];
	onActionReply?: (text: string) => void;
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
	isSystemEvent?: boolean;
	hideMessageActions?: boolean;
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
	documentChecklist,
	generatedPDF,
	paymentRequest,
	practiceConfig: _practiceConfig,
	onOpenSidebar: _onOpenSidebar,
	modeSelector,
	assistantRetry,
	authCta,
	onAuthPromptRequest,
	replyPreview,
	reactions = [],
	onReplyPreviewClick,
	onReply,
	onToggleReaction,
	isStreaming = false,
	isLoading,
	toolMessage,
	id: _id,
	practiceId: _practiceId,
	className = '',
	actions,
	onActionReply,
	onboardingProfile,
	isLast,
	isSystemEvent = false,
	hideMessageActions = false,
}) => {
	const handleReply = useCallback(() => {
		if (!onReply) return;
		onReply({
			messageId: _id ?? '',
			authorName: authorName ?? avatar?.name ?? 'Unknown',
			content,
			avatar,
		});
	}, [onReply, _id, authorName, avatar, content]);

	if (isSystemEvent) {
		return (
			<ConversationEventRow
				content={content}
				className={className}
			/>
		);
	}

	const hasContent = Boolean(content);
	const shouldShowIndicator = isLoading && !hasContent;
	
	const hasOnlyMedia = files.length > 0 && !content && files.every(file => 
		file.type.startsWith('image/') || 
		file.type.startsWith('video/') || 
		file.type.startsWith('audio/')
	);

	const messageAvatar = avatar;
	const showHeader = Boolean(authorName || timestamp);
	const contentClassName = '';
	const formattedTime = timestamp
		? formatRelativeTime(new Date(timestamp))
		: null;

	// Avatar size based on message size
	const avatarSize = size === 'sm' ? 'sm' : 'lg';
	const quickReactions = ['👍', '👀', '😂', '❤️'];

	const showActions = !hideMessageActions && Boolean(onReply || (onToggleReaction && features.enableMessageReactions));
	const hasReactions = reactions.length > 0 && features.enableMessageReactions;
	const hasReplyPreview = Boolean(replyPreview);
	const wrapperClassName = [
		'relative flex items-start gap-3 px-4 py-3 group message-list-item',
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
				<div className="message-action-popover">
					{onToggleReaction && features.enableMessageReactions && quickReactions.map((emoji) => (
						<button
							key={emoji}
							type="button"
							className="message-action-btn text-sm"
							aria-label={`React with ${emoji}`}
							onClick={() => _id && onToggleReaction(_id, emoji)}
						>
							{emoji}
						</button>
					))}
					{onReply && (
						<button
							type="button"
							className="message-action-btn"
							aria-label="Reply to message"
							onClick={handleReply}
						>
							<Icon icon={Undo2} className="h-4 w-4"  />
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
												className={onReplyPreviewClick
													? 'relative flex min-w-0 items-center gap-2 pl-7 text-left text-xs text-input-placeholder cursor-pointer transition hover:text-accent-foreground'
													: 'relative flex min-w-0 items-center gap-2 pl-7 text-left text-xs text-input-placeholder cursor-default pointer-events-none'
												}
						onClick={onReplyPreviewClick}
						disabled={!onReplyPreviewClick}
						aria-label="Jump to replied message"
					>
						<span className="pointer-events-none absolute left-[-32px] top-1/2 h-[14px] w-[60px] -translate-y-1/2 rounded-tl-xl border-l-[2px] border-t border-line-utility" />
						{replyPreview.avatar && (
							<MessageAvatar
								src={replyPreview.avatar.src}
								name={replyPreview.avatar.name}
								size="xs"
								className="flex-shrink-0 mt-0.5 relative z-10"
							/>
						)}
						<span className="font-semibold text-accent-foreground">{replyPreview.authorName}</span>
						<span className="truncate text-input-placeholder">
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
				documentChecklist={documentChecklist}
				generatedPDF={generatedPDF}
					paymentRequest={paymentRequest}
					modeSelector={modeSelector}
					assistantRetry={assistantRetry}
					authCta={authCta}
					onAuthPromptRequest={onAuthPromptRequest}
				actions={actions}
				onActionReply={onActionReply}
				onboardingProfile={onboardingProfile}
				isStreaming={isStreaming}
				isLast={isLast}
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
								className={`message-reaction-chip ${reaction.reactedByMe ? 'message-reaction-chip-active' : ''}`}
								aria-label={`React with ${reaction.emoji}`}
								onClick={() => _id && onToggleReaction?.(_id, reaction.emoji)}
							>
								<span className="text-sm">{reaction.emoji}</span>
								<span className="message-reaction-count">{reaction.count}</span>
							</button>
						))}
					</div>
				)}
			</MessageBubble>
		</div>
	);
});

export default Message;
