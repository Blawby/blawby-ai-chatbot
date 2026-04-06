import { describe, test, expect, vi, beforeEach } from 'vitest';
import { 
  isIntakeReadyForSubmission, 
  isIntakeSubmittable,
  normalizeIntakeConversationState,
  deriveIntakeStatusFromConsultation,
} from '../../../src/shared/utils/consultationState';
import type { IntakeConversationState, ConsultationState, ConsultationSubmissionState } from '../../../src/shared/types/intake';

// Helper function to create minimal intake state for testing
const createMinimalIntakeState = (overrides: Partial<IntakeConversationState> = {}): IntakeConversationState => ({
  practiceArea: null,
  description: null,
  urgency: null,
  opposingParty: null,
  city: null,
  state: null,
  desiredOutcome: null,
  courtDate: null,
  hasDocuments: null,
  turnCount: 0,
  ctaShown: false,
  ctaResponse: null,
  notYetCount: 0,
  ...overrides
});

// Helper function to create minimal consultation state for testing
const createMinimalConsultationState = (overrides: Partial<ConsultationState> = {}): ConsultationState => ({
  status: 'collecting_case',
  contact: null,
  case: createMinimalIntakeState(),
  submission: {
    intakeUuid: null,
    submittedAt: null,
    paymentRequired: null,
    paymentReceived: null,
    checkoutSessionId: null
  },
  mode: 'REQUEST_CONSULTATION',
  version: 1,
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

      expect(isIntakeReadyForSubmission(intake)).toBe(false);
    });

    test('should return true when all required fields are present', () => {
      const intake = createMinimalIntakeState({
        description: 'Divorce case in California',
        city: 'Los Angeles',
        state: 'CA'
      });

      expect(isIntakeReadyForSubmission(intake)).toBe(true);
    });

    test('should return false when any required field is missing', () => {
      const intake = createMinimalIntakeState({
        description: 'Divorce case',
        city: 'Los Angeles',
        state: '' // Missing
      });

      expect(isIntakeReadyForSubmission(intake)).toBe(false);
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

    test('should return the initial intake state for null or undefined input', () => {
      const result = normalizeIntakeConversationState(null);
      expect(result).toMatchObject({
        practiceArea: null,
        description: null,
        urgency: null,
        opposingParty: null,
        city: null,
        state: null,
        desiredOutcome: null,
        courtDate: null,
        hasDocuments: null,
        turnCount: 0,
        ctaShown: false,
        ctaResponse: null,
        notYetCount: 0,
      });
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
  });

  describe('isIntakeSubmittable', () => {
    test('should return true when intake ready and no payment required', () => {
      const intake = createMinimalIntakeState({
        description: 'Complete case',
        city: 'City',
        state: 'CA'
      });

      expect(isIntakeSubmittable(intake, { paymentRequired: false })).toBe(true);
    });

    test('should return true when payment required and received', () => {
      const intake = createMinimalIntakeState({
        description: 'Complete case',
        city: 'City',
        state: 'CA'
      });

      expect(isIntakeSubmittable(intake, { paymentRequired: true, paymentReceived: true })).toBe(true);
    });

    test('should return false when payment required but not received', () => {
      const intake = createMinimalIntakeState({
        description: 'Complete case',
        city: 'City',
        state: 'CA'
      });

      expect(isIntakeSubmittable(intake, { paymentRequired: true, paymentReceived: false })).toBe(false);
    });
  });

  describe('State Transition Validations', () => {
    test('should derive ai_brief when core fields are present but decision chips were not shown', () => {
      const consultation = createMinimalConsultationState({
        status: 'collecting_case',
        contact: { name: 'Client', email: 'client@example.com', phone: '555-555-1212' },
        case: createMinimalIntakeState({
          description: 'Complete case',
          city: 'City',
          state: 'CA',
          ctaShown: false,
          ctaResponse: null,
        }),
      });

      expect(deriveIntakeStatusFromConsultation({ consultation }).step).toBe('ai_brief');
    });

    test('should derive contact_form_decision when the intake decision chips have been shown', () => {
      const consultation = createMinimalConsultationState({
        status: 'collecting_case',
        contact: { name: 'Client', email: 'client@example.com', phone: '555-555-1212' },
        case: createMinimalIntakeState({
          description: 'Complete case',
          city: 'City',
          state: 'CA',
          ctaShown: true,
          ctaResponse: null,
        }),
      });

      expect(deriveIntakeStatusFromConsultation({ consultation }).step).toBe('contact_form_decision');
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
        practiceArea: 'Family Law',
        urgency: 'routine',
        desiredOutcome: 'Fair settlement',
        courtDate: '2024-06-15',
        hasDocuments: true
      });

      expect(isIntakeReadyForSubmission(intake)).toBe(true);
    });
  });
});
