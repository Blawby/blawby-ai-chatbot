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
    // The actual tools are only the three core intake tools
    expect(toolNames).toEqual(['save_case_details', 'request_payment', 'submit_intake']);
  });

  test('should confirm system prompt tells AI not to ask for contact info', () => {
    const services = [];
    const practiceContext = { practiceName: 'Test Firm' };
    const storedIntakeState = null;
    const submissionGate = { paymentRequiredBeforeSubmit: false, paymentCompleted: false };
    
    const prompt = buildIntakeSystemPrompt(services, practiceContext, storedIntakeState, submissionGate);
    
    expect(prompt).toContain('Never ask for contact info (name, email, phone) — it is already collected via the intake form');
  });

  test('should confirm contact info is handled by slim form', () => {
    const services = [];
    const practiceContext = { practiceName: 'Test Firm' };
    const storedIntakeState = null;
    const submissionGate = { paymentRequiredBeforeSubmit: false, paymentCompleted: false };
    
    const prompt = buildIntakeSystemPrompt(services, practiceContext, storedIntakeState, submissionGate);
    
    expect(prompt).toContain('it is already collected via the intake form');
  });
});
