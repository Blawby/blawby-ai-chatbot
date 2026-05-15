export interface CsvColumn<TRow> {
  key: keyof TRow & string;
  header: string;
  format?: (value: TRow[keyof TRow], row: TRow) => string | number | null | undefined;
}

const escapeCell = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  const str = typeof value === 'string' ? value : String(value);
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

export const toCsv = <TRow extends Record<string, unknown>>(
  rows: TRow[],
  columns: CsvColumn<TRow>[]
): string => {
  const headerRow = columns.map((col) => escapeCell(col.header)).join(',');
  const dataRows = rows.map((row) =>
    columns
      .map((col) => {
        const raw = row[col.key];
        const formatted = col.format ? col.format(raw, row) : raw;
        return escapeCell(formatted);
      })
      .join(',')
  );
  return [headerRow, ...dataRows].join('\r\n');
};
