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
  const sourceText = text ?? '';

  const classes = [
    'chat-markdown',
    sizeClasses[size],
    variantClasses[variant],
    className,
  ].filter(Boolean).join(' ');

  const hasVisibleText = sourceText.trim().length > 0;
  const streamingCursor = (isStreaming && !hasVisibleText)
    ? <span className="chat-cursor" aria-hidden="true" />
    : null;

  // Pre-process text to wrap @mentions in a specific link format that doesn't split the @
  // Skip formatting inside inline code and code blocks.
  const processedText = useMemo(() => {
    if (!sourceText) return '';
    
    // Split text by markdown code blocks (```...```) or inline code (`...`)
    // The regex captures the code segment, preserving it during split
    const parts = sourceText.split(/(```[\s\S]*?```|`[^`]*`)/g);
    
    return parts.map((part, index) => {
      // Even indices are text outside of code blocks/spans, odd indices are the captured code
      if (index % 2 === 0) {
        // Match @Name-style mentions (allow up to 3 words) and wrap in mention:// links
        return part.replace(
          /(^|\s)(@(?:[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N}._'-]*)(?:\s+[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N}._'-]*){0,2})(?=(?:\s|$|[.,!?;:]))/gu,
          (_match, p1, p2) => `${p1}[${p2}](mention://${encodeURIComponent(p2)})`
        );
      }
      return part; // Leave code segments unmodified
    }).join('');
  }, [sourceText]);

  if (!sourceText && !isStreaming) return null;

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
