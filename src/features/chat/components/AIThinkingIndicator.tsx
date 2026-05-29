import type { VNode } from 'preact';
import { useState, useMemo } from 'preact/hooks';
import { Check, Loader2, XCircle, AlertCircle, ChevronDown, ChevronRight, Wrench } from 'lucide-preact';
import { Icon } from '@/shared/ui/Icon';
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
  toolProgress?: Array<{
    toolUseId: string;
    toolName: string;
    label: string;
    status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  }>;
  isCompleted?: boolean;
}

export function AIThinkingIndicator({
  message,
  variant = 'thinking',
  className = '',
  content,
  toolMessage,
  toolProgress = [],
  isCompleted = false
}: AIThinkingIndicatorProps): VNode | null {
  const [isExpanded, setIsExpanded] = useState(!isCompleted);
  const config = variantConfig[variant];
  const displayMessage = toolMessage ?? message ?? config.defaultMessage;

  // Deduplicate toolProgress by toolUseId, keeping the latest status (last occurrence)
  const uniqueToolProgress = useMemo(() => {
    if (!toolProgress || toolProgress.length === 0) return [];
    const seen = new Set<string>();
    const deduped: typeof toolProgress = [];
    for (let i = toolProgress.length - 1; i >= 0; i--) {
      const tool = toolProgress[i];
      const dedupeKey = tool.toolUseId ? `id:${tool.toolUseId}` : `idx:${i}`;
      if (!seen.has(dedupeKey)) {
        seen.add(dedupeKey);
        deduped.unshift(tool);
      }
    }
    return deduped;
  }, [toolProgress]);

  // For streaming content, reuse the shared chat markdown renderer
  if (content) {
    return (
      <div className={`min-h-4 ${className}`}>
        <ChatMarkdown text={content} />
      </div>
    );
  }

  // If there are no tool calls, fall back to the default pulsing dot loader
  if (uniqueToolProgress.length === 0) {
    if (isCompleted) return null; // No need to render anything if completed and empty
    return (
      <div
        className={`flex items-center gap-2 min-h-4 ${className}`}
        role="status"
        aria-live="polite"
        aria-busy="true"
        aria-atomic="true"
      >
        <span className="ai-thinking-indicator__dot" aria-hidden="true" />
        <span className="text-xs text-dim-2">{displayMessage}…</span>
      </div>
    );
  }

  // If completed, show a summary row that toggles expansion
  if (isCompleted) {
    const failedCount = uniqueToolProgress.filter(t => t.status === 'failed').length;
    const summaryLabel = failedCount > 0
      ? `Used ${uniqueToolProgress.length} tools (${failedCount} failed)`
      : `Used ${uniqueToolProgress.length} tools`;

    return (
      <div className={`flex flex-col gap-1.5 w-full ${className}`}>
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-1.5 text-[11px] font-medium text-dim-2 hover:text-accent-foreground transition-colors outline-none cursor-pointer"
          aria-expanded={isExpanded}
        >
          <Icon icon={Wrench} className="h-3 w-3 text-dim-2" />
          <span>{summaryLabel}</span>
          <Icon icon={isExpanded ? ChevronDown : ChevronRight} className="h-3 w-3" />
        </button>
        
        {isExpanded && (
          <div className="flex flex-col gap-1 pl-4 mt-1 border-l border-line-subtle/50">
            {uniqueToolProgress.map(tool => (
              <ToolProgressRow key={tool.toolUseId} tool={tool} />
            ))}
          </div>
        )}
      </div>
    );
  }

  // If still loading/streaming, render the live list (no toggle, fully expanded)
  return (
    <div className={`flex flex-col gap-1.5 w-full ${className}`}>
      <div className="flex items-center gap-2 text-xs font-semibold text-accent-foreground mb-1">
        <span className="ai-thinking-indicator__dot" aria-hidden="true" />
        <span>Assistant is working…</span>
      </div>
      <div className="flex flex-col gap-1 pl-4 border-l border-line-subtle/50">
        {uniqueToolProgress.map(tool => (
          <ToolProgressRow key={tool.toolUseId} tool={tool} />
        ))}
      </div>
    </div>
  );
}

function ToolProgressRow({
  tool
}: {
  tool: {
    toolUseId: string;
    toolName: string;
    label: string;
    status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  };
}) {
  let statusIcon = AlertCircle;
  let iconClass = 'text-dim-2';
  
  if (tool.status === 'completed') {
    statusIcon = Check;
    iconClass = 'text-green-500';
  } else if (tool.status === 'failed') {
    statusIcon = XCircle;
    iconClass = 'text-red-500';
  } else if (tool.status === 'running') {
    statusIcon = Loader2;
    iconClass = 'text-accent-500 animate-spin';
  } else if (tool.status === 'queued') {
    statusIcon = Loader2;
    iconClass = 'text-dim-2 animate-pulse';
  }

  return (
    <div className="flex items-center gap-2 text-xs py-0.5" key={tool.toolUseId}>
      <Icon icon={statusIcon} className={`h-3.5 w-3.5 ${iconClass}`} />
      <span className={tool.status === 'completed' ? 'text-dim-2' : 'text-ink'}>
        {tool.label}
      </span>
    </div>
  );
}
