const DELIMITER = ';';

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

export const parseMultiValueText = (value: string | null | undefined): string[] => {
  if (typeof value !== 'string') return [];
  if (value.trim() === '') return [];
  return normalizeEntries(value.split(DELIMITER));
};

export const serializeMultiValueText = (values: string[]): string =>
  normalizeEntries(values).join(`${DELIMITER} `);
