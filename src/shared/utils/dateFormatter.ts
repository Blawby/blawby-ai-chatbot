export const formatLongDate = (value?: string | null): string => {
  if (!value) return 'Not available';

  // Detect bare date strings (e.g., "YYYY-MM-DD") and treat as local midnight
  const dateValue = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T00:00:00`
    : value;

  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) return 'Not available';
  return parsed.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};
