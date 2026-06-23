import type { ComponentChildren } from 'preact';

const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Wraps occurrences of each whitespace-separated token in `query` with a
 * `<mark>` element. Returns the plain string when the query is empty so the
 * caller can render result rows uniformly.
 *
 * Backend FTS already emits `<mark>` inside body snippets — this is the
 * client-side counterpart for fields the backend ships as plain text (titles,
 * subtitles). Matching is case-insensitive and operates on the raw query
 * tokens; it intentionally does not replicate FTS stemming.
 */
export function highlightText(text: string, query: string): ComponentChildren {
  const trimmed = query.trim();
  if (!trimmed || !text) return text;

  const tokens = Array.from(
    new Set(
      trimmed
        .split(/\s+/)
        .filter(Boolean)
        .map((token) => token.toLowerCase()),
    ),
  );
  if (tokens.length === 0) return text;

  const pattern = new RegExp(`(${tokens.map(escapeRegex).join('|')})`, 'gi');
  const out: ComponentChildren[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      out.push(text.slice(lastIndex, match.index));
    }
    out.push(<mark key={match.index}>{match[0]}</mark>);
    lastIndex = match.index + match[0].length;
    if (match[0].length === 0) pattern.lastIndex += 1;
  }
  if (lastIndex < text.length) out.push(text.slice(lastIndex));
  return out;
}
