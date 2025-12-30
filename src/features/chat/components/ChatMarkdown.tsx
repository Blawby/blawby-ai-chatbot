import { memo } from 'preact/compat';
import { useEffect, useState } from 'preact/hooks';
import type { FunctionComponent, VNode } from 'preact';

type ReactMarkdownType = typeof import('react-markdown').default;

interface ChatMarkdownProps {
  text: string;
  className?: string;
  isStreaming?: boolean;
  variant?: 'default' | 'compact' | 'detailed';
  size?: 'sm' | 'md' | 'lg';
}

const baseClassName = 'chat-markdown';

const ChatMarkdown: FunctionComponent<ChatMarkdownProps> = memo(({ text, className, isStreaming, variant = 'default', size = 'md' }) => {
  const [MarkdownImpl, setMarkdownImpl] = useState<ReactMarkdownType | null>(null);

  useEffect(() => {
    let mounted = true;
    import('react-markdown')
      .then(module => {
        if (mounted) {
          setMarkdownImpl(() => module.default);
        }
      })
      .catch(() => {
        /* swallow dynamic import errors and fall back to plain text */
      });

    return () => {
      mounted = false;
    };
  }, []);

  if (!text) {
    return null;
  }

  const variantClasses = {
    default: '',
    compact: 'text-sm',
    detailed: 'text-base'
  };

  const sizeClasses = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg'
  };

  const classes = [
    baseClassName,
    variantClasses[variant],
    sizeClasses[size],
    className
  ].filter(Boolean).join(' ');

  const hasVisibleText = text.trim().length > 0;
  // UI designer choice: Only show streaming cursor when there's no visible text
  // This prevents cursor from appearing over existing content during streaming
  const streamingCursor: VNode | null = isStreaming && !hasVisibleText
    ? <span className="chat-cursor" aria-hidden="true" />
    : null;

  if (MarkdownImpl) {
    return (
      <div className={classes}>
        <MarkdownImpl>{text}</MarkdownImpl>
        {streamingCursor}
      </div>
    );
  }

  return (
    <div className={classes}>
      <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit' }}>{text}</pre>
      {streamingCursor}
    </div>
  );
});

export default ChatMarkdown;
