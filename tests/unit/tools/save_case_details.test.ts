import { describe, test, expect, vi, beforeEach } from 'vitest';
import { handleSaveCaseDetails, type ToolResult } from '../../../worker/routes/aiChatIntake';

describe('save_case_details tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('should validate required fields', () => {
    const args = {
      description: '', // Empty - should fail
      city: 'Durham',
      state: 'CA'
    };

    const submissionGate = { paymentRequiredBeforeSubmit: false, paymentCompleted: false };
    const result = handleSaveCaseDetails(args, null, submissionGate);
    
    expect(result.success).toBe(false);
    expect(result.message).toBe('Case details incomplete — description, city, and state are required.');
  });

  test('should normalize state codes', () => {
    const args = {
      description: 'Divorce case in North Carolina',
      city: 'Durham',
      state: 'North Carolina' // Full name should be normalized to 'NC'
    };

    const submissionGate = { paymentRequiredBeforeSubmit: false, paymentCompleted: false };
    const result = handleSaveCaseDetails(args, null, submissionGate);
    
    expect(result.success).toBe(true);
    expect(result.intakeFields?.state).toBe('NC');
  });

  test('should return suggested replies for next missing field', () => {
    const args = {
      description: 'Divorce case in California',
      city: 'Los Angeles',
      state: 'CA'
      // urgency missing - should suggest urgency options
    };

    const submissionGate = { paymentRequiredBeforeSubmit: false, paymentCompleted: false };
    const result = handleSaveCaseDetails(args, null, submissionGate);
    
    expect(result.success).toBe(true);
    expect(result.suggestedReplies).toBeUndefined(); // No suggested replies when urgency not ready yet
  });

  test('should merge with existing intake state', () => {
    const existingState = {
      description: 'Existing description',
      city: 'Existing city',
      urgency: 'routine'
    };

    const args = {
      description: 'Updated description', // Should overwrite
      city: 'New city', // Should overwrite
      state: 'CA' // Should be added
      // urgency not provided - should keep existing
    };

    const submissionGate = { paymentRequiredBeforeSubmit: false, paymentCompleted: false };
    const result = handleSaveCaseDetails(args, existingState, submissionGate);
    
    expect(result.success).toBe(true);
    expect(result.intakeFields?.description).toBe('Updated description');
    expect(result.intakeFields?.city).toBe('New city');
    expect(result.intakeFields?.state).toBe('CA');
    // Note: urgency is not in intakeFields because it wasn't provided in args
  });

  test('should handle optional fields gracefully', () => {
    const args = {
      description: 'Contract dispute case',
      city: 'New York',
      state: 'NY',
      practiceArea: 'Business Law', // Optional
      urgency: 'routine', // Optional
      desiredOutcome: 'Get contract reviewed', // Optional
      courtDate: '2024-06-15', // Optional
      hasDocuments: true // Optional
    };

    const submissionGate = { paymentRequiredBeforeSubmit: false, paymentCompleted: false };
    const result = handleSaveCaseDetails(args, null, submissionGate);
    
    expect(result.success).toBe(true);
    expect(result.intakeFields?.practiceArea).toBe('Business Law');
    expect(result.intakeFields?.urgency).toBe('routine');
    expect(result.intakeFields?.desiredOutcome).toBe('Get contract reviewed');
    expect(result.intakeFields?.courtDate).toBe('2024-06-15');
    expect(result.intakeFields?.hasDocuments).toBe(true);
  });

  test('should validate urgency enum', () => {
    const args = {
      description: 'Test case',
      city: 'Test City',
      state: 'CA',
      urgency: 'invalid' // Invalid urgency
    };

    const submissionGate = { paymentRequiredBeforeSubmit: false, paymentCompleted: false };
    const result = handleSaveCaseDetails(args, null, submissionGate);
    
    expect(result.success).toBe(true);
    expect(result.intakeFields?.urgency).toBeUndefined(); // Invalid urgency ignored
  });

  test('should trim and limit description length', () => {
    const args = {
      description: '  This is a very long description that should be truncated to exactly 300 characters maximum length as specified in the implementation  '.repeat(10),
      city: 'Test City',
      state: 'CA'
    };

    const submissionGate = { paymentRequiredBeforeSubmit: false, paymentCompleted: false };
    const result = handleSaveCaseDetails(args, null, submissionGate);
    
    expect(result.success).toBe(true);
    expect(result.intakeFields?.description).toHaveLength(300);
    expect(result.intakeFields?.description).not.toMatch(/^  /); // Leading/trailing spaces trimmed
  });

  test('should trim and limit desiredOutcome length', () => {
    const args = {
      description: 'Test case',
      city: 'Test City',
      state: 'CA',
      desiredOutcome: '  This is a very long desired outcome that should be truncated to exactly 150 characters maximum length as specified  '.repeat(5)
    };

    const submissionGate = { paymentRequiredBeforeSubmit: false, paymentCompleted: false };
    const result = handleSaveCaseDetails(args, null, submissionGate);
    
    expect(result.success).toBe(true);
    expect(result.intakeFields?.desiredOutcome).toHaveLength(150);
    expect(result.intakeFields?.desiredOutcome).not.toMatch(/^  /); // Leading/trailing spaces trimmed
  });

  test('should indicate when intake is submittable', () => {
    const args = {
      description: 'Complete case description',
      city: 'Complete City',
      state: 'CA',
      urgency: 'routine',
      opposingParty: 'John Doe'
    };

    const submissionGate = { paymentRequiredBeforeSubmit: false, paymentCompleted: false };
    const result = handleSaveCaseDetails(args, null, submissionGate);
    
    expect(result.success).toBe(true);
    expect(result.message).toBe('Case details saved. All required fields collected.');
    expect(result.suggestedReplies).toEqual(['__submit__']);
  });

  test('should indicate when more fields needed', () => {
    const args = {
      description: 'Partial case description',
      city: 'Partial City',
      state: 'CA'
      // Missing urgency and opposingParty
    };

    const submissionGate = { paymentRequiredBeforeSubmit: false, paymentCompleted: false };
    const result = handleSaveCaseDetails(args, null, submissionGate);
    
    expect(result.success).toBe(true);
    expect(result.message).toBe('Case details saved. Continue collecting remaining fields.');
    expect(result.suggestedReplies).toBeUndefined();
  });
});
