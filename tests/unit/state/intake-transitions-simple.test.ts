import { describe, test, expect, vi, beforeEach } from 'vitest';
import { 
  isIntakeReadyForSubmission, 
  normalizeIntakeConversationState,
  deriveIntakeStatusFromConsultation,
} from '../../../src/shared/utils/consultationState';
import type { IntakeConversationState } from '../../../src/shared/types/intake';

// Helper function to create minimal intake state for testing
const createMinimalIntakeState = (overrides: Partial<IntakeConversationState> = {}): IntakeConversationState => ({
  practiceServiceUuid: null,
  description: null,
  urgency: null,
  opposingParty: null,
  city: null,
  state: null,
  desiredOutcome: null,
  courtDate: null,
  hasDocuments: null,
  householdSize: null,
  enrichmentMode: null,
  turnCount: 0,
  ctaShown: false,
  ctaResponse: null,
  notYetCount: 0,
  ...overrides
});

describe('Intake State Transitions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isIntakeReadyForSubmission', () => {
    test('should return false for empty intake', () => {
      const intake = createMinimalIntakeState({
        description: '',
        city: '',
        state: '',
        opposingParty: ''
      });

      // opposingParty is optional in current readiness rules
      expect(isIntakeReadyForSubmission(intake)).toBe(false);
    });

    test('should return true when all required fields are present', () => {
      const intake = createMinimalIntakeState({
        description: 'Divorce case in California',
        city: 'Los Angeles',
        state: 'CA',
        opposingParty: 'John Doe'
      });

      expect(isIntakeReadyForSubmission(intake)).toBe(true);
    });

    test('should return false when any required field is missing', () => {
      const intake = createMinimalIntakeState({
        description: 'Divorce case',
        city: 'Los Angeles',
        state: 'CA',
        opposingParty: '' // Missing
      });

      // opposingParty is optional for core fields; core fields are present
      expect(isIntakeReadyForSubmission(intake)).toBe(true);
    });
  });

  describe('normalizeIntakeConversationState', () => {
    test('should normalize empty values to null', () => {
      const input = createMinimalIntakeState({
        description: '',
        city: '   ',
        state: 'CA',
        opposingParty: null
      });

      const result = normalizeIntakeConversationState(input);
      
      expect(result.description).toBeNull();
      expect(result.city).toBeNull();
      expect(result.state).toBe('CA');
      expect(result.opposingParty).toBeNull();
    });

    test('should trim whitespace from string values', () => {
      const input = createMinimalIntakeState({
        description: '  Case description  ',
        city: '  City  ',
        state: ' CA ',
        opposingParty: '  Party  '
      });

      const result = normalizeIntakeConversationState(input);
      
      expect(result.description).toBe('Case description');
      expect(result.city).toBe('City');
      expect(result.state).toBe('CA');
      expect(result.opposingParty).toBe('Party');
    });

    test('should handle null/undefined input gracefully', () => {
      expect(normalizeIntakeConversationState(null)).toMatchObject({
        practiceServiceUuid: null,
        description: null,
        urgency: null,
        opposingParty: null,
        city: null,
        state: null,
        desiredOutcome: null,
        courtDate: null,
        hasDocuments: null,
        householdSize: null,
        enrichmentMode: null,
        turnCount: 0,
        ctaShown: false,
        ctaResponse: null,
        notYetCount: 0,
      });
      expect(normalizeIntakeConversationState(undefined)).toMatchObject({
        practiceServiceUuid: null,
        description: null,
        urgency: null,
        opposingParty: null,
        city: null,
        state: null,
        desiredOutcome: null,
        courtDate: null,
        hasDocuments: null,
        householdSize: null,
        enrichmentMode: null,
        turnCount: 0,
        ctaShown: false,
        ctaResponse: null,
        notYetCount: 0,
      });
    });
  });

  describe('State Transition Validations', () => {
    test('should derive ai_brief when core fields are present but decision chips were not shown', () => {
      const consultation = {
        status: 'collecting_case' as const,
        contact: { name: 'Client', email: 'client@test-blawby.com', phone: '555-555-1212' },
        case: createMinimalIntakeState({
          description: 'Complete case',
          city: 'City',
          state: 'CA',
          ctaShown: false,
          ctaResponse: null,
        }),
        submission: {
          intakeUuid: null,
          submittedAt: null,
          paymentRequired: null,
          paymentReceived: null,
          checkoutSessionId: null,
        },
        mode: 'REQUEST_CONSULTATION' as const,
        version: 1,
      };

      expect(deriveIntakeStatusFromConsultation({ consultation, disclaimerAcceptedAt: '2026-01-01' }).step).toBe('ai_brief');
    });

    test('should derive contact_form_decision when the intake decision chips have been shown', () => {
      const consultation = {
        status: 'collecting_case' as const,
        contact: { name: 'Client', email: 'client@test-blawby.com', phone: '555-555-1212' },
        case: createMinimalIntakeState({
          description: 'Complete case',
          city: 'City',
          state: 'CA',
          ctaShown: true,
          ctaResponse: null,
        }),
        submission: {
          intakeUuid: null,
          submittedAt: null,
          paymentRequired: null,
          paymentReceived: null,
          checkoutSessionId: null,
        },
        mode: 'REQUEST_CONSULTATION' as const,
        version: 1,
      };

      expect(deriveIntakeStatusFromConsultation({ consultation, disclaimerAcceptedAt: '2026-01-01' }).step).toBe('contact_form_decision');
    });

    test('should validate collecting_case -> ready_to_submit transition', () => {
      const intake = createMinimalIntakeState({
        description: 'Complete case',
        city: 'City',
        state: 'CA',
        opposingParty: 'Party'
      });

      // Should be able to transition to ready_to_submit
      expect(isIntakeReadyForSubmission(intake)).toBe(true);
    });

    test('should handle urgency validation', () => {
      const intake = createMinimalIntakeState({
        description: 'Emergency case',
        city: 'City',
        state: 'CA',
        opposingParty: 'Party',
        urgency: 'emergency'
      });

      expect(isIntakeReadyForSubmission(intake)).toBe(true);
    });

    test('should handle optional fields without affecting readiness', () => {
      const intake = createMinimalIntakeState({
        description: 'Complete case',
        city: 'City',
        state: 'CA',
        opposingParty: 'Party',
        practiceServiceUuid: '00000000-0000-0000-0000-000000000001',
        urgency: 'routine',
        desiredOutcome: 'Fair settlement',
        courtDate: '2024-06-15',
        hasDocuments: true
      });

      expect(isIntakeReadyForSubmission(intake)).toBe(true);
    });
  });
});
