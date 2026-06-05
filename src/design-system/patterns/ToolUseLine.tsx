import { Fragment } from 'preact';
import { cn } from '@/shared/utils/cn';

export interface ToolUseLineProps {
  /** Tool names the assistant ran. */
  tools: readonly string[];
  /** Optional total duration in ms (rendered as "142ms"). */
  durationMs?: number;
  /** Optional prefix glyph — defaults to "›". */
  prefix?: string;
  className?: string;
}

/**
 * Tool-use line (DESIGN_SYSTEM §3.5).
 *
 * Quiet mono line below an AI message showing which tools ran. Should align
 * to where the message body starts (callers control the 44px indent via
 * their own layout).
 */
export function ToolUseLine({ tools, durationMs, prefix = '›', className }: ToolUseLineProps) {
  if (tools.length === 0) return null;
  return (
    <div className={cn('tool-use', className)}>
      <span aria-hidden="true">{prefix}</span>
      <span>used</span>
      {tools.map((tool, idx) => (
        <Fragment key={tool}>
          <code>{tool}</code>
          {idx < tools.length - 1 && <span aria-hidden="true">·</span>}
        </Fragment>
      ))}
      {typeof durationMs === 'number' && (
        <>
          <span aria-hidden="true">·</span>
          <span>{durationMs}ms</span>
        </>
      )}
    </div>
  );
}
