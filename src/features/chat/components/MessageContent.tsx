import { FunctionComponent } from 'preact';
import ChatMarkdown from './ChatMarkdown';
import { LoadingSpinner } from '@/shared/ui/layout/LoadingSpinner';

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
        <LoadingSpinner size="md" />
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
