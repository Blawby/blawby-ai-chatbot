import { describe, test, expect, vi, beforeEach } from 'vitest';
import { 
  isIntakeReadyForSubmission, 
  isIntakeSubmittable,
  normalizeIntakeConversationState
} from '../../../src/shared/utils/consultationState';
import type { IntakeConversationState, ConsultationState } from '../../../src/shared/types/intake';

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
      expect(normalizeIntakeConversationState(null)).toBeNull();
      expect(normalizeIntakeConversationState(undefined)).toBeNull();
    });
  });

  describe('State Transition Validations', () => {
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
