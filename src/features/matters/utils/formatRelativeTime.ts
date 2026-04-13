export const formatRelativeTime = (dateValue: string | Date, now = new Date()) => {
 const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
 if (Number.isNaN(date.getTime())) return '';
 
 const diffMs = now.getTime() - date.getTime();
 
 // Handle future dates
 if (diffMs < 0) {
  const absDiffMs = Math.abs(diffMs);
  const sec = Math.round(absDiffMs / 1000);
  const min = Math.round(sec / 60);
  const hr = Math.round(min / 60);
  const day = Math.round(hr / 24);
  
  if (sec < 45) return 'in a moment';
  if (sec < 90) return 'in 1 min';
  if (min < 45) return `in ${min} min`;
  if (min < 90) return 'in 1 hr';
  if (hr < 24) return `in ${hr} hr`;
  if (hr < 36) return 'tomorrow';
  if (day < 30) return `in ${day} days`;
  
  // For future dates beyond 30 days, use calendar format
  return date.toLocaleDateString('en-US', {
   month: 'short',
   day: 'numeric',
   year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
  });
 }
 
 // Past dates - use proper rounding thresholds
 const sec = Math.round(diffMs / 1000);
 const min = Math.round(sec / 60);
 const hr = Math.round(min / 60);
 const day = Math.round(hr / 24);

 if (sec < 45) return 'just now';
 if (sec < 90) return '1 min ago';
 if (min < 45) return `${min} min ago`;
 if (min < 90) return '1 hr ago';
 if (hr < 24) return `${hr} hr ago`;
 if (hr < 36) return 'yesterday';
 if (day < 30) return `${day} days ago`;

 // Calendar-aware month calculation
 let months = (now.getFullYear() - date.getFullYear()) * 12 + (now.getMonth() - date.getMonth());
 if (now.getDate() < date.getDate()) months -= 1;

 if (months < 1) return '1 mo ago';
 if (months < 12) return `${months} mo ago`;

 // Calendar-aware year calculation
 let years = now.getFullYear() - date.getFullYear();
 if (now.getMonth() < date.getMonth() || (now.getMonth() === date.getMonth() && now.getDate() < date.getDate())) {
  years -= 1;
 }

 return years <= 1 ? '1 yr ago' : `${years} yr ago`;
};
