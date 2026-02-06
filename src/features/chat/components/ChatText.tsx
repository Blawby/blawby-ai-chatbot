import { FunctionComponent } from 'preact';
import ChatMarkdown from './ChatMarkdown';
import { chatTypography } from '@/features/chat/styles/chatTypography';

interface ChatTextProps {
  text: string;
  className?: string;
  isStreaming?: boolean;
  variant?: 'default' | 'compact' | 'detailed';
  size?: 'sm' | 'md' | 'lg';
}

export const ChatText: FunctionComponent<ChatTextProps> = ({
  text,
  className = '',
  isStreaming = false,
  variant = 'default',
  size = 'sm'
}) => {
  if (!text) return null;

  return (
    <ChatMarkdown
      text={text}
      isStreaming={isStreaming}
      variant={variant}
      size={size}
      className={`${chatTypography.messageBody} ${className}`.trim()}
    />
  );
};
