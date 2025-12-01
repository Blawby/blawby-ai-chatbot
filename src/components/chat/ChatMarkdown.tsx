import { memo } from 'preact/compat';
import { useEffect, useState } from 'preact/hooks';
import DOMPurify from 'dompurify';
import type { FunctionComponent, VNode } from 'preact';

type ReactMarkdownType = typeof import('react-markdown').default;

interface ChatMarkdownProps {
  text: string;
  className?: string;
  isStreaming?: boolean;
}

const baseClassName = 'chat-markdown';

const ChatMarkdown: FunctionComponent<ChatMarkdownProps> = memo(({ text, className, isStreaming }) => {
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
        /* swallow dynamic import errors and fall back to sanitized HTML */
      });

    return () => {
      mounted = false;
    };
  }, []);

  if (!text) {
    return null;
  }

  const classes = className ? `${baseClassName} ${className}` : baseClassName;

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
      <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(text) }} />
      {streamingCursor}
    </div>
  );
});

export default ChatMarkdown;
