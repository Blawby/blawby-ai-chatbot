import { describe, test, expect, vi, beforeEach } from 'vitest';
import { handleRequestPayment } from '../../../worker/routes/aiChatIntake';

describe('request_payment tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('should trigger payment flow', () => {
    const args = {
      reason: 'Consultation fee required before submission'
    };

    const result = handleRequestPayment(args);
    
    expect(result.success).toBe(true);
    expect(result.message).toBe('Payment requested.');
    expect(result.triggerPayment).toBe(true);
    expect(result.actions).toEqual([
      { type: 'submit', label: 'Continue', variant: 'primary' }
    ]);
  });

  test('should ignore args and always trigger payment', () => {
    const args = {
      reason: 'Some reason',
      extra: 'ignored field'
    };

    const result = handleRequestPayment(args);
    
    expect(result.success).toBe(true);
    expect(result.triggerPayment).toBe(true);
    expect(result.actions).toEqual([
      { type: 'submit', label: 'Continue', variant: 'primary' }
    ]);
  });

  test('should work with empty args', () => {
    const args = {};

    const result = handleRequestPayment(args);
    
    expect(result.success).toBe(true);
    expect(result.triggerPayment).toBe(true);
    expect(result.actions).toEqual([
      { type: 'submit', label: 'Continue', variant: 'primary' }
    ]);
  });

  test('should return consistent structure', () => {
    const args = {
      reason: 'Test reason'
    };

    const result = handleRequestPayment(args);
    
    // Verify the result structure matches ToolResult interface
    expect(typeof result.success).toBe('boolean');
    expect(typeof result.message).toBe('string');
    expect(typeof result.triggerPayment).toBe('boolean');
    expect(Array.isArray(result.actions)).toBe(true);
    expect(result.intakeFields).toBeUndefined();
    expect(result.triggerSubmit).toBeUndefined();
  });
});
