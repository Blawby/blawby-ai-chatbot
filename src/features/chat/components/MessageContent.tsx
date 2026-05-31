import { FunctionComponent } from 'preact';
import ChatMarkdown from './ChatMarkdown';
import { LoadingSpinner } from '@/shared/ui/layout/LoadingSpinner';

const ANALYSIS_LEADING_MARKER_PATTERN = /^[📄🔍]\s*/u;
const ANALYSIS_MARKDOWN_PATTERNS = [
  /!\[[^\]]*\]\([^)]*\)/,
  /\[[^\]]+\]\([^)]*\)/,
  /`{1,3}/,
  /\*\*[^*]+\*\*/,
  /__[^_]+__/,
  /(^|[\s(])\*[^*\n]+\*(?=$|[\s).,!?:;])/,
  /(^|[\s(])_[^_\n]+_(?=$|[\s).,!?:;])/,
  /^\s{0,3}#{1,6}\s/m,
  /^\s{0,3}>\s/m,
  /^\s{0,3}(?:[-+*]|\d+[.)])\s/m,
  /^\s*\|.*\|\s*$/m,
  /^\s*:?-{3,}:?(?:\s*\|\s*:?-{3,}:?)+\s*$/m,
  /<\/?[a-z][^>]*>/i,
] as const;

const getAnalysisAriaLabel = (content: string, isAnalysisMessage: boolean): string | undefined => {
  if (!isAnalysisMessage) {
    return undefined;
  }

  const plainTextLabel = content.replace(ANALYSIS_LEADING_MARKER_PATTERN, '').trim();

  if (!plainTextLabel) {
    return undefined;
  }

  return ANALYSIS_MARKDOWN_PATTERNS.some((pattern) => pattern.test(plainTextLabel))
    ? undefined
    : plainTextLabel;
};

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
  
  // Strip self-annotated quick replies from display text
  const displayContent = content.replace(/\n?\bQUICK_REPLIES:\s*.*(?:\n|$)/gi, '').trim();
  const hasQuickRepliesMarker = /\bQUICK_REPLIES:/i.test(content);
  
  if (!displayContent && (hasQuickRepliesMarker || !content.trim())) {
    return null;
  }

  // Special styling for analysis status messages
  const isAnalysisMessage = !isUser && (content.includes('📄 Analyzing document') || content.includes('🔍'));
  const analysisAriaLabel = getAnalysisAriaLabel(displayContent, isAnalysisMessage);

  if (isAnalysisMessage) {
    return (
      <div className={`status-info flex items-center gap-2 px-3 py-2 rounded-r-md ${className}`}>
        <LoadingSpinner size="md" ariaLabel={analysisAriaLabel} />
        <ChatMarkdown text={displayContent} isStreaming={isStreaming} variant={variant} size={size} />
      </div>
    );
  }

  // Chat-bubble surface (Pencil LymwK / rmTOt). Sent uses accent fill with a
  // sharper bottom-right corner; received uses a raised surface with a sharper
  // bottom-left corner. Padding & radius mirror the design components.
  const bubbleClassName = isUser
    ? 'inline-block max-w-full rounded-2xl rounded-br-[4px] bg-accent px-[14px] py-[10px] text-accent-ink shadow-sm'
    : 'inline-block max-w-full rounded-2xl rounded-bl-[4px] bg-[rgb(var(--surface-card-hover))] px-[14px] py-[10px] text-ink';

  // The outer wrapper is a flex row so the inline-block bubble follows the
  // sender alignment even when the column it sits in (MessageBubble) is wider
  // than the bubble's content — e.g. when the author/time header above is
  // longer than a short message.
  return (
    <div
      className={`flex min-h-4 min-w-0 max-w-full ${isUser ? 'justify-end' : 'justify-start'} ${className}`}
    >
      <div className={bubbleClassName}>
        <ChatMarkdown text={displayContent} isStreaming={isStreaming} variant={variant} size={size} />
      </div>
    </div>
  );
};
