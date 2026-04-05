import { describe, test, expect, vi, beforeEach } from 'vitest';
import { handleSubmitIntake, type ToolResult } from '../../../worker/routes/aiChatIntake';

describe('submit_intake tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('should validate user confirmation', () => {
    const args = {
      confirmed: true
    };

    const result = handleSubmitIntake(args);
    
    expect(result.success).toBe(true);
    expect(result.message).toBe('Intake submission confirmed.');
    expect(result.triggerSubmit).toBe(true);
    expect(result.actions).toEqual([
      { type: 'submit', label: 'Submit request', variant: 'primary' }
    ]);
  });

  test('should reject submission without confirmation', () => {
    const args = {
      confirmed: false
    };

    const result = handleSubmitIntake(args);
    
    expect(result.success).toBe(false);
    expect(result.message).toBe('Submit not confirmed by user.');
    expect(result.triggerSubmit).toBeUndefined();
    expect(result.actions).toBeUndefined();
  });

  test('should reject submission with missing confirmation', () => {
    const args = {};

    const result = handleSubmitIntake(args);
    
    expect(result.success).toBe(false);
    expect(result.message).toBe('Submit not confirmed by user.');
    expect(result.triggerSubmit).toBeUndefined();
    expect(result.actions).toBeUndefined();
  });

  test('should reject submission with invalid confirmation type', () => {
    const args = {
      confirmed: 'true' // String instead of boolean
    };

    const result = handleSubmitIntake(args);
    
    expect(result.success).toBe(false);
    expect(result.message).toBe('Submit not confirmed by user.');
    expect(result.triggerSubmit).toBeUndefined();
    expect(result.actions).toBeUndefined();
  });

  test('should ignore extra fields', () => {
    const args = {
      confirmed: true,
      extraField: 'ignored',
      anotherField: 'also ignored'
    };

    const result = handleSubmitIntake(args);
    
    expect(result.success).toBe(true);
    expect(result.triggerSubmit).toBe(true);
    expect(result.actions).toEqual([
      { type: 'submit', label: 'Submit request', variant: 'primary' }
    ]);
  });

  test('should return consistent structure', () => {
    const args = {
      confirmed: true
    };

    const result = handleSubmitIntake(args);
    
    // Verify the result structure matches ToolResult interface
    expect(typeof result.success).toBe('boolean');
    expect(typeof result.message).toBe('string');
    expect(typeof result.triggerSubmit).toBe('boolean');
    expect(Array.isArray(result.actions)).toBe(true);
    expect(result.intakeFields).toBeUndefined();
    expect(result.triggerPayment).toBeUndefined();
  });
});
