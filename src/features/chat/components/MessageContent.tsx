import { FunctionComponent } from 'preact';
import ChatMarkdown from './ChatMarkdown';

interface MessageContentProps {
	content: string;
	isStreaming?: boolean;
	isUser?: boolean;
	variant?: 'default' | 'compact' | 'detailed';
	size?: 'sm' | 'md' | 'lg';
	className?: string;
}

export const MessageContent: FunctionComponent<MessageContentProps> = ({
	content,
	isStreaming = false,
	isUser = false,
	variant = 'default',
	size = 'md',
	className = ''
}) => {
	if (!content) return null;

	// Special styling for analysis status messages
	const isAnalysisMessage = !isUser && (content.includes('📄 Analyzing document') || content.includes('🔍'));

	if (isAnalysisMessage) {
		return (
			<div className={`status-info flex items-center gap-2 px-3 py-2 rounded-lg ${className}`}>
				<div className="animate-spin h-4 w-4 border-2 border-accent-400 border-t-transparent rounded-full" role="status" aria-live="polite">
					<span className="sr-only">Loading…</span>
				</div>
				<ChatMarkdown text={content} isStreaming={isStreaming} variant={variant} size={size} />
			</div>
		);
	}

	return (
		<div className={`min-h-4 ${className}`}>
			<ChatMarkdown text={content} isStreaming={isStreaming} variant={variant} size={size} />
		</div>
	);
};
