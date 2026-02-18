import { FunctionComponent } from 'preact';
import ChatMarkdown from './ChatMarkdown';
import { chatTypography } from '@/features/chat/styles/chatTypography';

interface ChatTextProps {
  text: string;
  className?: string;
  isStreaming?: boolean;
}

export const ChatText: FunctionComponent<ChatTextProps> = ({
  text,
  className = '',
  isStreaming = false
}) => {
  if (!text) return null;

  return (
    <ChatMarkdown
      text={text}
      isStreaming={isStreaming}
      className={`${chatTypography.messageBody} ${className}`.trim()}
    />
  );
};
