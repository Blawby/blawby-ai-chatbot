export const formatRelativeTime = (dateValue: string) => {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '';
  const diffMs = Date.now() - date.getTime();
  
  // Handle future dates
  if (diffMs < 0) {
    const absDiffMs = Math.abs(diffMs);
    const minutes = Math.floor(absDiffMs / (1000 * 60));
    const hours = Math.floor(absDiffMs / (1000 * 60 * 60));
    const days = Math.floor(absDiffMs / (1000 * 60 * 60 * 24));
    
    if (minutes < 1) return 'in less than a minute';
    if (minutes < 60) return `in ${minutes}m`;
    if (hours < 24) return `in ${hours}h`;
    if (days < 7) return `in ${days}d`;
    const weeks = Math.floor(days / 7);
    if (weeks < 4) return `in ${weeks}w`;
    
    return `in the future`;
  }
  
  const minutes = Math.floor(diffMs / (1000 * 60));
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};
