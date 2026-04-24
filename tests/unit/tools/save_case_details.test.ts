import { describe, test, expect, vi, beforeEach } from 'vitest';
import { handleSaveCaseDetails } from '../../../worker/routes/aiChatIntake';

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
    
    // Save handlers accept partial updates; they return success:true even for empty fields
    expect(result.success).toBe(true);
    // But an empty required field should not be considered submittable
    expect(result.submittable).toBe(false);
    expect(result.message).toContain('Case details saved');
    // Ensure the message does not claim all required fields collected
    expect(result.message).not.toContain('All required fields collected');
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

  test('should return submit when the core intake fields are present', () => {
    const args = {
      description: 'Divorce case in California',
      city: 'Los Angeles',
      state: 'CA'
    };

    const submissionGate = { paymentRequiredBeforeSubmit: false, paymentCompleted: false };
    const result = handleSaveCaseDetails(args, null, submissionGate);
    
    expect(result.success).toBe(true);
    expect(result.actions).toEqual(expect.arrayContaining([
      { type: 'submit', label: 'Submit request', variant: 'primary' }
    ]));
  });

  test('should return only provided args in intakeFields, ignoring existing state', () => {
    const existingState = {
      description: 'Existing description',
      city: 'Existing city',
      urgency: 'routine'
    };

    const args = {
      description: 'Updated description', // Should overwrite
      city: 'New city', // Should overwrite
      state: 'CA' // Should be added
      // urgency not provided - intakeFields contains only provided args
    };

    const submissionGate = { paymentRequiredBeforeSubmit: false, paymentCompleted: false };
    const result = handleSaveCaseDetails(args, existingState, submissionGate);
    
    expect(result.success).toBe(true);
    expect(result.intakeFields?.description).toBe('Updated description');
    expect(result.intakeFields?.city).toBe('New city');
    expect(result.intakeFields?.state).toBe('CA');
    // intakeFields contains only fields provided in args, not existing merged fields
    expect(result.intakeFields?.urgency).toBeUndefined();
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
    // Non-standard fields are placed under customFields
    const customFields = result.intakeFields?.customFields as unknown as Record<string, unknown> | undefined;
    expect(customFields?.practiceArea as unknown as string).toBe('Business Law');
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
    expect(result.intakeFields?.description).not.toMatch(/^ {2}/); // Leading/trailing spaces trimmed
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
    expect(result.intakeFields?.desiredOutcome).not.toMatch(/^ {2}/); // Leading/trailing spaces trimmed
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
    expect(result.actions).toEqual(expect.arrayContaining([
      { type: 'submit', label: 'Submit request', variant: 'primary' }
    ]));
  });

  test('should indicate submit even when optional fields are still missing', () => {
    const args = {
      description: 'Partial case description',
      city: 'Partial City',
      state: 'CA'
    };

    const submissionGate = { paymentRequiredBeforeSubmit: false, paymentCompleted: false };
    const result = handleSaveCaseDetails(args, null, submissionGate);
    
    expect(result.success).toBe(true);
    expect(result.message).toBe('Case details saved. All required fields collected.');
    expect(result.actions).toEqual(expect.arrayContaining([
      { type: 'submit', label: 'Submit request', variant: 'primary' }
    ]));
  });

  test('should support incremental updates with only optional fields if basic state exists', () => {
    const existingState = {
      description: 'Existing description',
      city: 'Existing city',
      state: 'CA'
    };

    const args = {
      opposingParty: 'New Opponent' // No description, city, or state in this patch
    };

    const submissionGate = { paymentRequiredBeforeSubmit: false, paymentCompleted: false };
    const result = handleSaveCaseDetails(args, existingState, submissionGate);
    
    expect(result.success).toBe(true);
    expect(result.intakeFields?.opposingParty).toBe('New Opponent');
    expect(result.intakeFields?.description).toBeUndefined(); // Should not re-send what we already have if not in args
  });
});
