export const parseDateOnlyUtc = (dateString: string): Date => new Date(`${dateString}T00:00:00Z`);

export const formatDateOnlyStringUtc = (date: Date): string => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const formatDateOnlyUtc = (
  dateString: string,
  locale = 'en-US',
  options?: Intl.DateTimeFormatOptions
): string => {
  const date = parseDateOnlyUtc(dateString);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(locale, options || {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};

export const getUtcStartOfToday = (): Date => {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return today;
};

export const buildTomorrowDateStringUtc = (): string => {
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return formatDateOnlyStringUtc(tomorrow);
};
