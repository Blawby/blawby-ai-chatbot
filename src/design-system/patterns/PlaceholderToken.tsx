import { cn } from '@/shared/utils/cn';

export interface PlaceholderTokenProps {
  /** Display text. For unresolved, the raw `{{key}}` or key alone; for resolved, the substituted value. */
  value: string;
  /** Whether the placeholder has been substituted with a real value. */
  status: 'unresolved' | 'resolved';
  /** Optional placeholder key (e.g. "clientName"); attached as data attr + title.
   *  Named `placeholderKey` (not `key`) because `key` is a Preact reserved VNode prop. */
  placeholderKey?: string;
  className?: string;
}

/**
 * Placeholder token (Engagement letter §Engagement.html).
 *
 * Golden chip with monospace key for unresolved `{{key}}` placeholders;
 * green chip with serif value once resolved. Designed for inline use
 * inside the serif letter body — see EngagementReview / LetterPaper.
 */
export function PlaceholderToken({ value, status, placeholderKey, className }: PlaceholderTokenProps) {
  return (
    <span
      className={cn('placeholder-token', status === 'resolved' && 'placeholder-token-resolved', className)}
      data-placeholder-key={placeholderKey}
      title={placeholderKey ? `{{${placeholderKey}}}` : undefined}
    >
      {value}
    </span>
  );
}

export type PlaceholderParsed =
  | { type: 'text'; value: string }
  | { type: 'placeholder'; value: string; key: string; resolved: boolean };

/**
 * Split a string with `{{key}}` tokens into ordered text/placeholder segments.
 * Each placeholder is resolved against the `resolved` map — present keys
 * produce a substituted segment marked `resolved: true`, unknown keys
 * produce the raw `{{key}}` marked `resolved: false`.
 *
 * Designed for rendering with `<PlaceholderToken />`: walk the segments and
 * emit either plain text or a token element per entry.
 */
export function parsePlaceholders(
  text: string,
  resolved: Record<string, string>,
): PlaceholderParsed[] {
  if (!text) return [];
  const segments: PlaceholderParsed[] = [];
  const pattern = /\{\{(\w+)\}\}/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    }
    const key = match[1];
    const value = Object.prototype.hasOwnProperty.call(resolved, key) ? resolved[key] : null;
    if (typeof value === 'string') {
      segments.push({ type: 'placeholder', value, key, resolved: true });
    } else {
      segments.push({ type: 'placeholder', value: match[0], key, resolved: false });
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) });
  }
  return segments;
}
