import { describe, test, expect, vi, beforeEach } from 'vitest';
import { INTAKE_TOOLS, buildIntakeSystemPrompt } from '../../../worker/routes/aiChatIntake';

// Note: save_contact_info tool was removed from INTAKE_TOOLS in the actual implementation
// This test verifies that the tool is indeed not part of the intake flow

describe('save_contact_info tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('should confirm tool is not in INTAKE_TOOLS', () => {
    const toolNames = INTAKE_TOOLS.map(tool => tool.function.name);
    
    expect(toolNames).not.toContain('save_contact_info');
    // The actual tools include the case save, payment, submit, and ask_user_question utilities
    expect(toolNames).toEqual(['save_case_details', 'request_payment', 'submit_intake', 'ask_user_question']);
  });

  test('should confirm system prompt tells AI not to ask for contact info', () => {
    const services = [];
    const practiceContext = { practiceName: 'Test Firm' };
    const storedIntakeState = null;
    
    const prompt = buildIntakeSystemPrompt(services, practiceContext, storedIntakeState);
    
    expect(prompt).toContain('Never ask for contact info');
    expect(prompt).toContain('already collected');
  });

  test('should confirm contact info is handled by slim form', () => {
    const services = [];
    const practiceContext = { practiceName: 'Test Firm' };
    const storedIntakeState = null;
    
    const prompt = buildIntakeSystemPrompt(services, practiceContext, storedIntakeState);
    
    expect(prompt).toContain('already collected');
  });
});
