import { memo, useEffect, useMemo, useState } from 'preact/compat';
import type { FunctionComponent } from 'preact';
import remarkGfm from 'remark-gfm';
import { markdownComponents } from '@/shared/ui/markdown/markdownComponents';

// Custom hook to dynamically import react-markdown on client
function useReactMarkdown() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [ReactMarkdown, setReactMarkdown] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const loadMarkdown = async () => {
      try {
        const mod = await import('react-markdown');
        if (mounted) {
          setReactMarkdown(() => mod.default);
          setError(null);
        }
      } catch (err) {
        if (mounted) {
          const errorMsg = err instanceof Error ? err.message : 'Failed to load markdown component';
          setError(errorMsg);
          setReactMarkdown(null);
        }
      }
    };

    void loadMarkdown();

    return () => {
      mounted = false;
    };
  }, []);

  return { component: ReactMarkdown, error };
}

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
  const { component: ReactMarkdown, error: markdownError } = useReactMarkdown();

  if (!text) return null;

  const classes = [
    'chat-markdown',
    sizeClasses[size],
    variantClasses[variant],
    className,
  ].filter(Boolean).join(' ');

  const hasVisibleText = text.trim().length > 0;
  const streamingCursor = (isStreaming && !hasVisibleText)
    ? <span className="chat-cursor" aria-hidden="true" />
    : null;

  // Pre-process text to wrap @mentions in a specific link format that doesn't split the @
  const processedText = useMemo(() => {
    if (!text) return '';
    // Match @ followed by an email address and wrap it in a mention:// link
    return text.replace(/(^|\s)(@[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, '$1[$2](mention://$2)');
  }, [text]);

  return (
    <div className={classes}>
      {markdownError ? (
        <div className="text-red-500 text-sm">Failed to load markdown: {markdownError}</div>
      ) : ReactMarkdown ? (
        <ReactMarkdown components={markdownComponents} remarkPlugins={[remarkGfm]}>
          {processedText}
        </ReactMarkdown>
      ) : (
        <div className="text-gray-500 text-sm">Loading markdown...</div>
      )}
      {streamingCursor}
    </div>
  );
});

export default ChatMarkdown;
