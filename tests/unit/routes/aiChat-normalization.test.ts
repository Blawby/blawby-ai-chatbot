import { describe, test, expect, vi, beforeEach } from 'vitest';
import type { ToolResult } from '../../../src/shared/types/intake';
import { 
  normalizeAiTurn, 
  shouldPersistNormalizedTurn, 
  type NormalizedAiTurn,
  type AiTurnNormalizationOptions 
} from '../../../worker/routes/aiChat';

describe('AI Chat Normalization', () => {
  const mockToolResult: ToolResult = {
    success: true,
    intakeState: {
      description: 'divorce case',
      city: 'Charlotte',
      state: 'NC',
      opposingParty: null,
      urgency: null,
      hasDocuments: false,
      turnCount: 1,
      ctaShown: false,
      ctaResponse: null,
      notYetCount: 0,
      intakeReady: false,
      quickReplies: null
    },
    isReadyForSubmission: false,
    missingFields: ['opposingParty', 'urgency'],
    suggestedReplies: [],
    paymentRequired: false,
    paymentLinkUrl: null,
    error: null,
    recoveryActions: [],
    quickReplies: null,
    conversationContext: {
      messageCount: 2,
      extractedFields: ['description', 'city', 'state'],
      currentStep: 'collecting_opposing_party'
    }
  };

  const mockActions = [
    { type: 'submit', label: 'Continue', variant: 'primary' as const }
  ];

  describe('normalizeAiTurn()', () => {
    test('should return model reply when model provides text and tools', () => {
      const accumulatedReply = 'Thanks for the location. Who is the opposing party?';
      const options: AiTurnNormalizationOptions = { repairMode: true };

      const result = normalizeAiTurn(
        accumulatedReply,
        mockToolResult,
        { city: 'Charlotte' },
        mockActions,
        options
      );

      expect(result.displayReply).toBe(accumulatedReply);
      expect(result.replySource).toBe('model');
      expect(result.requiresRepair).toBe(false);
      expect(result.usedSyntheticReply).toBe(false);
      expect(result.hadModelText).toBe(true);
      expect(result.toolOnlyCompletion).toBe(false);
    });

    test('should apply synthetic repair for tool-only responses in repair mode', () => {
      const accumulatedReply = '';
      const options: AiTurnNormalizationOptions = { repairMode: true };

      const result = normalizeAiTurn(
        accumulatedReply,
        mockToolResult,
        { city: 'Charlotte' },
        mockActions,
        options
      );

      expect(result.displayReply).toBeTruthy();
      expect(result.displayReply.length).toBeGreaterThan(0);
      expect(result.replySource).toBe('synthetic');
      expect(result.requiresRepair).toBe(true);
      expect(result.usedSyntheticReply).toBe(true);
      expect(result.hadModelText).toBe(false);
      expect(result.toolOnlyCompletion).toBe(true);
      expect(result.repairReasons).toContain('Tool-only completion detected');
    });

    test('should throw error for tool-only responses in strict mode', () => {
      const accumulatedReply = '';
      const options: AiTurnNormalizationOptions = { repairMode: false };

      expect(() => {
        normalizeAiTurn(
          accumulatedReply,
          mockToolResult,
          { city: 'Charlotte' },
          mockActions,
          options
        );
      }).toThrow('Model produced tool-only response in strict mode');
    });

    test('should handle empty reply with no tools', () => {
      const accumulatedReply = '';
      const options: AiTurnNormalizationOptions = { repairMode: true };

      const result = normalizeAiTurn(
        accumulatedReply,
        null,
        {},
        [],
        options
      );

      expect(result.displayReply).toBe('');
      expect(result.replySource).toBe('empty');
      expect(result.requiresRepair).toBe(false);
      expect(result.usedSyntheticReply).toBe(false);
      expect(result.hadModelText).toBe(false);
      expect(result.toolOnlyCompletion).toBe(false);
    });

    test('should preserve all data fields through normalization', () => {
      const accumulatedReply = 'Some reply';
      const intakePatch = { city: 'Charlotte' };
      const options: AiTurnNormalizationOptions = { repairMode: true };

      const result = normalizeAiTurn(
        accumulatedReply,
        mockToolResult,
        intakePatch,
        mockActions,
        options
      );

      expect(result.intakePatch).toEqual(intakePatch);
      expect(result.actions).toEqual(mockActions);
      expect(result.toolResult).toBe(mockToolResult);
    });
  });

  describe('shouldPersistNormalizedTurn()', () => {
    test('should return true when displayReply has content', () => {
      const turn: NormalizedAiTurn = {
        displayReply: 'Some content',
        replySource: 'model',
        intakePatch: {},
        actions: [],
        requiresRepair: false,
        repairReasons: [],
        hadModelText: true,
        usedSyntheticReply: false,
        toolOnlyCompletion: false,
        triggerPayment: false,
        triggerSubmit: false
      };

      expect(shouldPersistNormalizedTurn(turn)).toBe(true);
    });

    test('should return true when actions exist', () => {
      const turn: NormalizedAiTurn = {
        displayReply: '',
        replySource: 'empty',
        intakePatch: {},
        actions: mockActions,
        requiresRepair: false,
        repairReasons: [],
        hadModelText: false,
        usedSyntheticReply: false,
        toolOnlyCompletion: false,
        triggerPayment: false,
        triggerSubmit: false
      };

      expect(shouldPersistNormalizedTurn(turn)).toBe(true);
    });

    test('should return true when intakePatch exists', () => {
      const turn: NormalizedAiTurn = {
        displayReply: '',
        replySource: 'empty',
        intakePatch: { city: 'Charlotte' },
        actions: [],
        requiresRepair: false,
        repairReasons: [],
        hadModelText: false,
        usedSyntheticReply: false,
        toolOnlyCompletion: false,
        triggerPayment: false,
        triggerSubmit: false
      };

      expect(shouldPersistNormalizedTurn(turn)).toBe(true);
    });

    test('should return true when triggerPayment is true', () => {
      const turn: NormalizedAiTurn = {
        displayReply: '',
        replySource: 'empty',
        intakePatch: {},
        actions: [],
        requiresRepair: false,
        repairReasons: [],
        hadModelText: false,
        usedSyntheticReply: false,
        toolOnlyCompletion: false,
        triggerPayment: true,
        triggerSubmit: false
      };

      expect(shouldPersistNormalizedTurn(turn)).toBe(true);
    });

    test('should return true when triggerSubmit is true', () => {
      const turn: NormalizedAiTurn = {
        displayReply: '',
        replySource: 'empty',
        intakePatch: {},
        actions: [],
        requiresRepair: false,
        repairReasons: [],
        hadModelText: false,
        usedSyntheticReply: false,
        toolOnlyCompletion: false,
        triggerPayment: false,
        triggerSubmit: true
      };

      expect(shouldPersistNormalizedTurn(turn)).toBe(true);
    });

    test('should return false when no persistence criteria are met', () => {
      const turn: NormalizedAiTurn = {
        displayReply: '',
        replySource: 'empty',
        intakePatch: {},
        actions: [],
        requiresRepair: false,
        repairReasons: [],
        hadModelText: false,
        usedSyntheticReply: false,
        toolOnlyCompletion: false,
        triggerPayment: false,
        triggerSubmit: false
      };

      expect(shouldPersistNormalizedTurn(turn)).toBe(false);
    });
  });

  describe('observability metrics', () => {
    test('should correctly track tool-only completion flags', () => {
      const options: AiTurnNormalizationOptions = { repairMode: true };

      // Tool-only case
      const toolOnlyResult = normalizeAiTurn(
        '',
        mockToolResult,
        { city: 'Charlotte' },
        mockActions,
        options
      );

      expect(toolOnlyResult.hadModelText).toBe(false);
      expect(toolOnlyResult.usedSyntheticReply).toBe(true);
      expect(toolOnlyResult.toolOnlyCompletion).toBe(true);

      // Model text case
      const modelTextResult = normalizeAiTurn(
        'Some reply',
        mockToolResult,
        { city: 'Charlotte' },
        mockActions,
        options
      );

      expect(modelTextResult.hadModelText).toBe(true);
      expect(modelTextResult.usedSyntheticReply).toBe(false);
      expect(modelTextResult.toolOnlyCompletion).toBe(false);
    });

    test('should capture repair reasons for diagnostics', () => {
      const options: AiTurnNormalizationOptions = { repairMode: true };

      const result = normalizeAiTurn(
        '',
        mockToolResult,
        { city: 'Charlotte' },
        mockActions,
        options
      );

      expect(result.repairReasons).toContain('Tool-only completion detected');
      expect(result.repairReasons.length).toBeGreaterThan(0);
    });
  });
});
