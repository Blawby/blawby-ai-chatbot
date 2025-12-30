import { describe, it, expect } from 'vitest';
import { 
  formatDateForSelector, 
  formatFullDate, 
  formatTimeWithTimezone, 
  getDateGrid, 
  getTimeSlots, 
  formatTimeSlot 
} from '../../../src/shared/utils/dateTime';

describe('dateTime', () => {
  describe('formatDateForSelector', () => {
    it('should format date for selector correctly', () => {
      const date = new Date('2024-02-15T10:30:00Z');
      const formatted = formatDateForSelector(date);
      expect(formatted).toBe('15 Thu');
    });

    it('should handle different dates', () => {
      const dates = [
        new Date('2024-01-01'),
        new Date('2024-12-31'),
      ];

      const expected = [
        '1 Mon',
        '31 Tue',
      ];

      dates.forEach((date, index) => {
        expect(formatDateForSelector(date)).toBe(expected[index]);
      });
    });
  });

  describe('formatFullDate', () => {
    it('should format full date correctly', () => {
      const date = new Date('2024-02-15T10:30:00Z');
      const formatted = formatFullDate(date);
      expect(formatted).toBe('Thursday, February 15, 2024');
    });
  });

  describe('formatTimeWithTimezone', () => {
    it('should format time with timezone', () => {
      const date = new Date('2024-02-15T10:30:00Z');
      const formatted = formatTimeWithTimezone(date);
      expect(formatted).toMatch(/^\d{1,2}:\d{2} (AM|PM)/);
      expect(formatted).toContain('GMT');
    });
  });

  describe('getDateGrid', () => {
    it('should return correct number of dates', () => {
      const dates = getDateGrid(new Date(), 7);
      expect(dates).toHaveLength(7);
    });

    it('should return future dates', () => {
      const startDate = new Date('2024-02-15');
      const dates = getDateGrid(startDate, 5);
      
      dates.forEach((date, index) => {
        const expectedDate = new Date(startDate);
        expectedDate.setDate(startDate.getDate() + index);
        expect(date.getDate()).toBe(expectedDate.getDate());
      });
    });
  });

  describe('getTimeSlots', () => {
    it('should return correct time slots for morning', () => {
      const baseDate = new Date('2024-02-15');
      const slots = getTimeSlots(baseDate, 'morning');
      expect(slots.length).toBeGreaterThan(0);
      
      // Check that slots are in the morning (8 AM to 12 PM)
      slots.forEach(slot => {
        const hour = slot.getHours();
        expect(hour).toBeGreaterThanOrEqual(8);
        expect(hour).toBeLessThan(12);
      });
    });

    it('should return correct time slots for afternoon', () => {
      const baseDate = new Date('2024-02-15');
      const slots = getTimeSlots(baseDate, 'afternoon');
      expect(slots.length).toBeGreaterThan(0);
      
      // Check that slots are in the afternoon (12 PM to 5 PM)
      slots.forEach(slot => {
        const hour = slot.getHours();
        expect(hour).toBeGreaterThanOrEqual(12);
        expect(hour).toBeLessThan(17);
      });
    });
  });

  describe('formatTimeSlot', () => {
    it('should format time slot correctly', () => {
      const date = new Date('2024-02-15T10:30:00Z');
      const formatted = formatTimeSlot(date);
      expect(formatted).toMatch(/^\d{1,2}:\d{2} (AM|PM)$/);
    });
  });
}); 