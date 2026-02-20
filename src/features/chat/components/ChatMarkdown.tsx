import { memo } from 'preact/compat';
import type { FunctionComponent } from 'preact';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { markdownComponents } from '@/shared/ui/markdown/markdownComponents';

interface ChatMarkdownProps {
  text: string;
  className?: string;
  isStreaming?: boolean;
  variant?: 'default' | 'compact' | 'detailed';
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm: 'text-sm',
  md: 'text-[0.9375rem]',
  lg: 'text-base',
} as const;

const variantClasses = {
  default: '',
  compact: 'text-sm',
  detailed: 'text-base',
} as const;

const ChatMarkdown: FunctionComponent<ChatMarkdownProps> = memo(({
  text,
  className,
  isStreaming,
  variant = 'default',
  size = 'md',
}) => {
  if (!text) return null;

  const classes = [
    'chat-markdown',
    sizeClasses[size],
    variantClasses[variant],
    className,
  ].filter(Boolean).join(' ');

  const hasVisibleText = text.trim().length > 0;
  const streamingCursor = isStreaming && !hasVisibleText
    ? <span className="chat-cursor" aria-hidden="true" />
    : null;

  return (
    <div className={classes}>
      <ReactMarkdown components={markdownComponents} remarkPlugins={[remarkGfm]}>
        {text}
      </ReactMarkdown>
      {streamingCursor}
    </div>
  );
});

export default ChatMarkdown;
