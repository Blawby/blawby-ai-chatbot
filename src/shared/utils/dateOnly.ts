export const parseDateOnlyUtc = (dateString: string): Date => new Date(`${dateString}T00:00:00Z`);

export const formatDateOnlyUtc = (dateString: string, locale = 'en-US'): string => {
  const date = parseDateOnlyUtc(dateString);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(locale, {
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
