export function formatDateForSelector(date: Date): string {
  const day = date.getDate();
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayName = dayNames[date.getDay()];
  return `${day} ${dayName}`;
}

export function formatFullDate(date: Date): string {
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  };
  return date.toLocaleDateString('en-US', options);
}

export function formatTimeWithTimezone(date: Date): string {
  // Convert to UTC/GMT time
  const utcTimeString = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'UTC'
  });
  return `${utcTimeString} GMT`;
}

export function getDateGrid(startDate: Date, count: number): Date[] {
  const dates: Date[] = [];
  for (let i = 0; i < count; i++) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + i);
    dates.push(date);
  }
  return dates;
}

export function getTimeSlots(baseDate?: Date, period?: 'morning' | 'afternoon'): Date[] {
  const slots: Date[] = [];
  const date = baseDate || new Date();
  
  let startHour = 9;
  let endHour = 17;
  
  if (period === 'morning') {
    startHour = 8;
    endHour = 12;
  } else if (period === 'afternoon') {
    startHour = 12;
    endHour = 17;
  }
  
  for (let hour = startHour; hour < endHour; hour++) {
    for (let minute = 0; minute < 60; minute += 30) {
      const slot = new Date(date);
      slot.setHours(hour, minute, 0, 0);
      slots.push(slot);
    }
  }
  
  return slots;
}

export function formatTimeSlot(time: string | Date): string {
  let hour: number, minute: number;
  
  if (typeof time === 'string') {
    const [h, m] = time.split(':').map(Number);
    hour = h;
    minute = m;
  } else {
    hour = time.getHours();
    minute = time.getMinutes();
  }
  
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${displayHour}:${minute.toString().padStart(2, '0')} ${period}`;
}

export function formatDate(date: string | Date): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  
  // Check if the date is valid
  if (isNaN(dateObj.getTime())) {
    return '';
  }
  
  return dateObj.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

export function formatDateToYYYYMMDD(dateString: string | undefined | null): string | null {
  if (!dateString) return null;
  
  // Check if input is already in YYYY-MM-DD format
  const yyyyMmDdRegex = /^(\d{4})-(\d{2})-(\d{2})$/;
  const match = dateString.match(yyyyMmDdRegex);
  
  if (match) {
    // Parse YYYY-MM-DD as local date to avoid timezone drift
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const day = parseInt(match[3], 10);
    
    // Validate date components
    if (month < 1 || month > 12 || day < 1 || day > 31) {
      return null;
    }
    
    // Create local date (monthIndex = month - 1)
    const date = new Date(year, month - 1, day);
    
    // Verify the date is valid (handles invalid dates like Feb 30)
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
      return null;
    }
    
    return dateString; // Already in correct format
  }
  
  // For other date formats, use existing logic
  const date = new Date(dateString);
  
  // Check if the date is valid
  if (isNaN(date.getTime())) {
    return null;
  }
  
  // Use local date components to avoid UTC conversion
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  
  return `${year}-${month}-${day}`;
} 