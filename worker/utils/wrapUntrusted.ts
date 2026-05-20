/**
 * wrapUntrusted — quarantine for client-controlled free-text fields
 * that surface to Claude through MCP tool responses.
 *
 * Plan R9 + risks table: "Prompt-injection attack via client-controlled
 * intake content reaching Claude through `get_practice_briefing`."
 * Mechanized per OWASP MCP Tool Poisoning guidance.
 *
 * Every field in a tool response that originated from client input —
 * intake `description`, intake `metadata.description`, matter
 * `notes[].body`, conversation message bodies, client-supplied
 * `display_name` — is wrapped before return. The wrapping boundary
 * cannot be escaped from inside: XML special characters in the value
 * are entity-escaped so `</untrusted_input>` in the payload becomes
 * literal text, not a closing tag.
 *
 * Pattern courtesy of Anthropic's own prompt-engineering guidance for
 * Claude — when a tool produces content the model didn't generate,
 * wrap it in clear semantic boundaries the model has been trained to
 * recognize as untrusted.
 */

const XML_ESCAPE_MAP: Record<string, string> = {
  '<': '&lt;',
  '>': '&gt;',
  '&': '&amp;',
  '"': '&quot;',
  "'": '&apos;',
};

const escapeXmlSpecial = (value: string): string =>
  value.replace(/[<>&"']/g, (char) => XML_ESCAPE_MAP[char] ?? char);

const escapeAttr = (value: string): string => escapeXmlSpecial(value).replace(/\n/g, ' ');

/**
 * Wraps `value` in an `<untrusted_input>` element with a `source`
 * attribute identifying where the content came from. The boundary
 * survives any attempt to embed `</untrusted_input>` or attribute-
 * injection sequences in the value itself.
 *
 * Returns the empty string unchanged (no need to wrap absence).
 */
export const wrapUntrusted = (value: string, source: string): string => {
  if (value.length === 0) return value;
  const escapedSource = escapeAttr(source);
  const escapedValue = escapeXmlSpecial(value);
  return `<untrusted_input source="${escapedSource}">${escapedValue}</untrusted_input>`;
};

/**
 * Convenience: wrap only when value is a non-empty string; pass null/
 * undefined through unchanged. Useful when projecting wire types where
 * a field may legitimately be absent.
 */
export const wrapUntrustedOptional = (
  value: string | null | undefined,
  source: string,
): string | null | undefined => {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'string') return value;
  return wrapUntrusted(value, source);
};
