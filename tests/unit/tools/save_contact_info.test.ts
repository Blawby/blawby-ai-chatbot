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

  test('should include strict type instructions for structured custom fields', () => {
    const services = [];
    const practiceContext = { practiceName: 'Test Firm' };
    const storedIntakeState = null;
    const templateFields = [
      {
        key: 'injurySeverity',
        label: 'How severe was the injury?',
        type: 'select' as const,
        required: true,
        phase: 'required' as const,
        isStandard: false,
        options: ['Minor', 'Moderate', 'Severe'],
      },
      {
        key: 'hearingDate',
        label: 'Next hearing date',
        type: 'date' as const,
        required: false,
        phase: 'enrichment' as const,
        isStandard: false,
      },
      {
        key: 'hasWitnesses',
        label: 'Any witnesses?',
        type: 'boolean' as const,
        required: false,
        phase: 'enrichment' as const,
        isStandard: false,
      },
      {
        key: 'damagesEstimate',
        label: 'Estimated damages',
        type: 'number' as const,
        required: false,
        phase: 'enrichment' as const,
        isStandard: false,
      },
    ];

    const prompt = buildIntakeSystemPrompt(
      services,
      practiceContext,
      storedIntakeState,
      null,
      templateFields[0],
      0,
      templateFields,
    );

    expect(prompt).toContain('Only accept values exactly matching these options: [Minor, Moderate, Severe]');
    expect(prompt).toContain('Do not make up values.');
  });

  test('should include date, boolean, and number instructions when those fields are next', () => {
    const services = [];
    const practiceContext = { practiceName: 'Test Firm' };
    const storedIntakeState = null;

    const datePrompt = buildIntakeSystemPrompt(
      services,
      practiceContext,
      storedIntakeState,
      null,
      {
        key: 'hearingDate',
        label: 'Next hearing date',
        type: 'date',
        required: false,
        phase: 'enrichment',
        isStandard: false,
      },
      0,
      [],
    );
    expect(datePrompt).toContain('Format this value strictly as YYYY-MM-DD');

    const booleanPrompt = buildIntakeSystemPrompt(
      services,
      practiceContext,
      storedIntakeState,
      null,
      {
        key: 'hasWitnesses',
        label: 'Any witnesses?',
        type: 'boolean',
        required: false,
        phase: 'enrichment',
        isStandard: false,
      },
      0,
      [],
    );
    expect(booleanPrompt).toContain('Resolve this to strictly true or false');

    const numberPrompt = buildIntakeSystemPrompt(
      services,
      practiceContext,
      storedIntakeState,
      null,
      {
        key: 'damagesEstimate',
        label: 'Estimated damages',
        type: 'number',
        required: false,
        phase: 'enrichment',
        isStandard: false,
      },
      0,
      [],
    );
    expect(numberPrompt).toContain('Extract the numerical value only');
  });
});
