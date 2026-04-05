import { describe, test, expect, vi, beforeEach } from 'vitest';
import type { IntakeConversationState, ConsultationState } from '../../../src/shared/types/intake';

// Mock the complete intake flow
const mockCompleteIntakeFlow = vi.fn();

describe('Complete Intake Flow Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('should handle complete intake from start to finish', async () => {
    // Simulate complete user journey
    const userMessages = [
      'I need help with a divorce case in California',
      'My spouse is Jane Smith and we have a court date next month',
      'This is time sensitive because of the court date',
      'I have some documents ready to share'
    ];

    const result = await mockCompleteIntakeFlow(userMessages);
    
    expect(result.success).toBe(true);
    expect(result.intakeState).toMatchObject({
      description: expect.stringContaining('divorce'),
      city: expect.any(String),
      state: 'CA',
      opposingParty: 'Jane Smith',
      urgency: 'time_sensitive',
      hasDocuments: true
    });
    expect(result.isReadyForSubmission).toBe(true);
  });

  test('should handle partial intake with missing required fields', async () => {
    const userMessages = [
      'I need legal help',
      'I live in New York'
      // Missing description and opposing party
    ];

    const result = await mockCompleteIntakeFlow(userMessages);
    
    expect(result.success).toBe(false);
    expect(result.missingFields).toContain('description');
    expect(result.missingFields).toContain('opposingParty');
    expect(result.suggestedReplies).toContain(['What is your case about?', 'Who is the opposing party?']);
  });

  test('should handle payment flow when required', async () => {
    const userMessages = [
      'I need help with a business contract dispute',
      'The other party is ABC Corporation',
      'We are in Delaware and this is urgent',
      'I want to resolve this quickly'
    ];

    const result = await mockCompleteIntakeFlow(userMessages, { practiceRequiresPayment: true });
    
    expect(result.success).toBe(true);
    expect(result.isReadyForSubmission).toBe(true);
    expect(result.paymentRequired).toBe(true);
    expect(result.paymentLinkUrl).toBeTruthy();
  });

  test('should handle tool execution in correct order', async () => {
    const userMessages = [
      'My name is John Smith, email is john@example.com, phone is 555-1234',
      'I need help with a contract dispute in Delaware against ABC Corp',
      'This is time sensitive because we have a deadline next month'
    ];

    const toolExecutionOrder = [];
    
    const result = await mockCompleteIntakeFlow(userMessages, {
      onToolCall: (toolName) => toolExecutionOrder.push(toolName)
    });
    
    // Should execute tools in logical order
    expect(toolExecutionOrder).toEqual([
      'save_contact_info', // Should be no-op but still called
      'save_case_details', // Main case information
      'request_payment',  // If payment required
      'submit_intake'     // Final submission
    ]);
  });

  test('should handle state transitions correctly', async () => {
    const userMessages = [
      'I need legal help',
      'Divorce case in California against my spouse',
      'We live in Los Angeles'
    ];

    const stateTransitions = [];
    
    const result = await mockCompleteIntakeFlow(userMessages, {
      onStateChange: (from, to) => stateTransitions.push({ from, to })
    });
    
    expect(stateTransitions).toEqual([
      { from: 'idle', to: 'collecting_case' },
      { from: 'collecting_case', to: 'ready_to_submit' },
      { from: 'ready_to_submit', to: 'submitted' }
    ]);
  });

  test('should handle error conditions gracefully', async () => {
    const userMessages = [
      'I need help with a case'
      // Incomplete information
    ];

    const result = await mockCompleteIntakeFlow(userMessages, {
      simulateError: 'payment_gateway_failure'
    });
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('Payment gateway error');
    expect(result.recoveryActions).toContain(['Try again', 'Contact support']);
  });

  test('should validate practice-specific requirements', async () => {
    const userMessages = [
      'I need help with immigration case',
      'I am in Florida and need help with visa application',
      'This is routine but important'
    ];

    const result = await mockCompleteIntakeFlow(userMessages, {
      practiceConfig: {
        requiredFields: ['description', 'city', 'state', 'urgency'],
        optionalFields: ['opposingParty', 'courtDate'],
        paymentRequired: false
      }
    });
    
    expect(result.success).toBe(true);
    expect(result.isReadyForSubmission).toBe(true);
    expect(result.paymentRequired).toBe(false);
  });

  test('should handle concurrent access safely', async () => {
    const userMessages = [
      'I need help with employment law case',
      'My employer is Tech Corp in San Francisco',
      'Wrongful termination, need urgent help'
    ];

    // Simulate staff editing while AI processes
    const staffEdits = {
      urgency: 'emergency',
      desiredOutcome: 'Reinstatement and compensation'
    };

    const result = await mockCompleteIntakeFlow(userMessages, {
      concurrentStaffEdits: staffEdits
    });
    
    expect(result.success).toBe(true);
    // Should merge AI and staff changes without data loss
    expect(result.intakeState.urgency).toBe('emergency'); // Staff wins
    expect(result.intakeState.description).toContain('employment'); // AI preserved
    expect(result.intakeState.desiredOutcome).toBe('Reinstatement and compensation'); // Staff preserved
  });

  test('should generate appropriate quick replies at each step', async () => {
    const userMessages = [
      'I need help with a case'
    ];

    const result = await mockCompleteIntakeFlow(userMessages);
    
    expect(result.quickReplies).toEqual([
      'What type of legal issue are you facing?',
      'Which state is this in?',
      'Who is the opposing party?'
    ]);
  });

  test('should maintain conversation context throughout flow', async () => {
    const userMessages = [
      'I need help with a divorce',
      'In California, against my spouse',
      'We live in Los Angeles',
      'This is time sensitive'
    ];

    const result = await mockCompleteIntakeFlow(userMessages);
    
    expect(result.conversationContext).toMatchObject({
      messageCount: 4,
      extractedFields: ['description', 'opposingParty', 'city', 'state', 'urgency'],
      currentStep: 'ready_to_submit'
    });
  });
});
