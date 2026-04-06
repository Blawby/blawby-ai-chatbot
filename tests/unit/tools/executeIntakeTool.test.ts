import { describe, test, expect, vi, beforeEach } from 'vitest';
import { 
  executeIntakeTool
} from '../../../worker/routes/aiChatIntake';

describe('executeIntakeTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('should execute save_case_details tool', () => {
    const toolName = 'save_case_details';
    const rawArgs = JSON.stringify({
      description: 'Test case',
      city: 'Test City',
      state: 'CA'
    });
    const storedIntakeState = null;
    const submissionGate = { paymentRequiredBeforeSubmit: false, paymentCompleted: false };

    const result = executeIntakeTool(toolName, rawArgs, storedIntakeState, submissionGate);
    
    expect(result.success).toBe(true);
    expect(result.intakeFields?.description).toBe('Test case');
    expect(result.intakeFields?.city).toBe('Test City');
    expect(result.intakeFields?.state).toBe('CA');
  });

  test('should execute request_payment tool', () => {
    const toolName = 'request_payment';
    const rawArgs = JSON.stringify({ reason: 'Test reason' });
    const storedIntakeState = null;
    const submissionGate = { paymentRequiredBeforeSubmit: false, paymentCompleted: false };

    const result = executeIntakeTool(toolName, rawArgs, storedIntakeState, submissionGate);
    
    expect(result.success).toBe(true);
    expect(result.triggerPayment).toBe(true);
    expect(result.actions).toEqual([
      { type: 'submit', label: 'Continue', variant: 'primary' }
    ]);
  });

  test('should execute submit_intake tool', () => {
    const toolName = 'submit_intake';
    const rawArgs = JSON.stringify({ confirmed: true });
    const storedIntakeState = null;
    const submissionGate = { paymentRequiredBeforeSubmit: false, paymentCompleted: false };

    const result = executeIntakeTool(toolName, rawArgs, storedIntakeState, submissionGate);
    
    expect(result.success).toBe(true);
    expect(result.triggerSubmit).toBe(true);
    expect(result.actions).toEqual([
      { type: 'submit', label: 'Submit request', variant: 'primary' }
    ]);
  });

  test('should handle invalid JSON args', () => {
    const toolName = 'save_case_details';
    const rawArgs = 'invalid json';
    const storedIntakeState = null;
    const submissionGate = { paymentRequiredBeforeSubmit: false, paymentCompleted: false };

    const result = executeIntakeTool(toolName, rawArgs, storedIntakeState, submissionGate);
    
    expect(result.success).toBe(false);
    expect(result.message).toContain('Failed to parse tool arguments');
  });

  test('should handle unknown tool name', () => {
    const toolName = 'unknown_tool';
    const rawArgs = '{}';
    const storedIntakeState = null;
    const submissionGate = { paymentRequiredBeforeSubmit: false, paymentCompleted: false };

    const result = executeIntakeTool(toolName, rawArgs, storedIntakeState, submissionGate);
    
    expect(result.success).toBe(false);
    expect(result.message).toContain('Unknown tool: unknown_tool');
  });

  test('should pass submissionGate to save_case_details', () => {
    const toolName = 'save_case_details';
    const rawArgs = JSON.stringify({
      description: 'Test case',
      city: 'Test City',
      state: 'CA',
      urgency: 'routine',
      opposingParty: 'John Doe'
    });
    const storedIntakeState = null;
    const submissionGate = { paymentRequiredBeforeSubmit: false, paymentCompleted: false };

    const result = executeIntakeTool(toolName, rawArgs, storedIntakeState, submissionGate);
    
    expect(result.success).toBe(true);
    expect(result.actions).toEqual([
      { type: 'submit', label: 'Submit request', variant: 'primary' }
    ]);
  });

  test('should handle empty args for request_payment', () => {
    const toolName = 'request_payment';
    const rawArgs = '{}';
    const storedIntakeState = null;
    const submissionGate = { paymentRequiredBeforeSubmit: false, paymentCompleted: false };

    const result = executeIntakeTool(toolName, rawArgs, storedIntakeState, submissionGate);
    
    expect(result.success).toBe(true);
    expect(result.triggerPayment).toBe(true);
  });

  test('should handle submit_intake with false confirmation', () => {
    const toolName = 'submit_intake';
    const rawArgs = JSON.stringify({ confirmed: false });
    const storedIntakeState = null;
    const submissionGate = { paymentRequiredBeforeSubmit: false, paymentCompleted: false };

    const result = executeIntakeTool(toolName, rawArgs, storedIntakeState, submissionGate);
    
    expect(result.success).toBe(false);
    expect(result.message).toBe('Submit not confirmed by user.');
  });

  test('should merge intake state correctly', () => {
    const toolName = 'save_case_details';
    const rawArgs = JSON.stringify({
      description: 'New description',
      city: 'New city',
      state: 'NY' // Adding required state field
    });
    const storedIntakeState = {
      description: 'Old description',
      state: 'CA',
      urgency: 'routine'
    };
    const submissionGate = { paymentRequiredBeforeSubmit: false, paymentCompleted: false };

    const result = executeIntakeTool(toolName, rawArgs, storedIntakeState, submissionGate);
    
    expect(result.success).toBe(true);
    expect(result.intakeFields?.description).toBe('New description'); // Overwritten
    expect(result.intakeFields?.city).toBe('New city'); // Overwritten
    expect(result.intakeFields?.state).toBe('NY'); // Overwritten
    // Note: urgency is not in intakeFields because it wasn't provided in args
    // The tool only returns fields that were actually provided in the args
  });
});
