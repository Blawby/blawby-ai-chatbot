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
			<div className={`flex items-center gap-2 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-3 py-2 rounded-lg border border-blue-200 dark:border-blue-800 ${className}`}>
				<div className="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full" role="status" aria-live="polite">
					<span className="sr-only">Loading…</span>
				</div>
				<ChatMarkdown text={content} isStreaming={isStreaming} variant={variant} size={size} />
			</div>
		);
	}

	return (
		<div className={`text-sm leading-5 min-h-4 ${className}`}>
			<ChatMarkdown text={content} isStreaming={isStreaming} variant={variant} size={size} />
		</div>
	);
};
