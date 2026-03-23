import type { VNode } from 'preact';
import ChatMarkdown from './ChatMarkdown';

// Define allowed variant types
export type AIThinkingVariant = 'thinking' | 'processing' | 'generating';

// Icon and default message mapping with proper typing
const variantConfig = {
  thinking: {
    defaultMessage: 'AI is thinking',
    ariaLabel: 'AI is thinking'
  },
  processing: {
    defaultMessage: 'Processing your request',
    ariaLabel: 'Processing your request'
  },
  generating: {
    defaultMessage: 'Generating response',
    ariaLabel: 'Generating response'
  }
} satisfies Record<AIThinkingVariant, {
  defaultMessage: string;
  ariaLabel: string;
}>;

export interface AIThinkingIndicatorProps {
  message?: string;
  variant?: AIThinkingVariant;
  className?: string;
  content?: string; // For showing streaming content
  toolMessage?: string; // Custom message for tool calls
}

export function AIThinkingIndicator({
  message,
  variant = 'thinking',
  className = '',
  content,
  toolMessage
}: AIThinkingIndicatorProps): VNode {
  const config = variantConfig[variant];
  const displayMessage = toolMessage ?? message ?? config.defaultMessage;

  // For streaming content, reuse the shared chat markdown renderer
  if (content) {
    return (
      <div className={`min-h-4 ${className}`}>
        <ChatMarkdown text={content} />
      </div>
    );
  }

  // For thinking indicators, use the full wrapper
  return (
    <div
      className={`flex items-center gap-2 min-h-4 ${className}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-atomic="true"
    >
      <span className="ai-thinking-indicator__dot" aria-hidden="true" />
      <span className="sr-only">{displayMessage}</span>
    </div>
  );
}
