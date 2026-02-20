const DELIMITER = ';';
const ESCAPE = '\\';

const normalizeEntries = (values: string[]): string[] => {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const value of values) {
    const entry = value.trim().replace(/\s+/g, ' ');
    if (!entry) continue;

    const dedupeKey = entry.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    normalized.push(entry);
  }

  return normalized;
};

const escapeEntry = (value: string): string =>
  value
    .replace(/\\/g, `${ESCAPE}${ESCAPE}`)
    .replace(/;/g, `${ESCAPE}${DELIMITER}`);

const splitEscaped = (value: string): string[] => {
  const entries: string[] = [];
  let current = '';

  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];

    if (char === ESCAPE && i + 1 < value.length) {
      const next = value[i + 1];
      // Only treat escaped delimiter/backslash specially.
      if (next === DELIMITER || next === ESCAPE) {
        current += next;
        i += 1;
        continue;
      }
    }

    if (char === DELIMITER) {
      entries.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  entries.push(current);
  return entries;
};

export const parseMultiValueText = (value: string | null | undefined): string[] => {
  if (typeof value !== 'string') return [];
  if (value.trim() === '') return [];
  return normalizeEntries(splitEscaped(value));
};

export const serializeMultiValueText = (values: string[]): string =>
  normalizeEntries(values)
    .map(escapeEntry)
    .join(`${DELIMITER} `);
