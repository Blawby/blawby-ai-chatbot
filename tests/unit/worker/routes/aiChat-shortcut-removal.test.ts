import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  HOURS_QUESTION_REGEX,
  SERVICE_QUESTION_REGEX,
  LEGAL_INTENT_REGEX,
  LEGAL_DISCLAIMER,
} from '../../../../worker/routes/aiChatShared.js';

/**
 * Back-fill for U3 of docs/plans/2026-05-18-002-feat-strengthen-intake-ai-observability-plan.md.
 *
 * U3 removed the silent hours and services regex shortcuts in aiChat.ts that
 * intercepted intake messages and returned hard-coded replies. Those constants
 * (HOURS_QUESTION_REGEX, SERVICE_QUESTION_REGEX) intentionally remain exported
 * from aiChatShared.ts in case other consumers want them, but no call site in
 * aiChat.ts is allowed to short-circuit on them anymore.
 *
 * This spec is a structural test on aiChat.ts source — if a regression
 * reintroduces a `HOURS_QUESTION_REGEX.test(...)` or
 * `SERVICE_QUESTION_REGEX.test(...)` shortcut, the test fails loud.
 */

const AICHAT_SOURCE_PATH = resolve(
  process.cwd(),
  'worker/routes/aiChat.ts',
);

const aiChatSource = readFileSync(AICHAT_SOURCE_PATH, 'utf8');

describe('aiChat.ts — U3 regex shortcut removal', () => {
  it('does NOT call HOURS_QUESTION_REGEX.test (the U3 shortcut is deleted)', () => {
    expect(aiChatSource).not.toMatch(/HOURS_QUESTION_REGEX\.test/);
  });

  it('does NOT call SERVICE_QUESTION_REGEX.test (the U3 shortcut is deleted)', () => {
    expect(aiChatSource).not.toMatch(/SERVICE_QUESTION_REGEX\.test/);
  });

  it('does NOT import HOURS_QUESTION_REGEX or SERVICE_QUESTION_REGEX from aiChatShared', () => {
    // The imports were removed alongside the call sites in U3.
    expect(aiChatSource).not.toMatch(/\bHOURS_QUESTION_REGEX\b/);
    expect(aiChatSource).not.toMatch(/\bSERVICE_QUESTION_REGEX\b/);
  });

  it('still imports LEGAL_INTENT_REGEX + LEGAL_DISCLAIMER (the kept safety rail)', () => {
    expect(aiChatSource).toMatch(/\bLEGAL_INTENT_REGEX\b/);
    expect(aiChatSource).toMatch(/\bLEGAL_DISCLAIMER\b/);
  });

  it('still uses LEGAL_INTENT_REGEX.test to gate the safety rail', () => {
    expect(aiChatSource).toMatch(/LEGAL_INTENT_REGEX\.test/);
  });
});

describe('aiChatShared — regex constants present for callers', () => {
  it('HOURS_QUESTION_REGEX, SERVICE_QUESTION_REGEX, LEGAL_INTENT_REGEX all match plausible questions', () => {
    expect(HOURS_QUESTION_REGEX.test('what are your hours?')).toBe(true);
    expect(SERVICE_QUESTION_REGEX.test('what services do you offer?')).toBe(true);
    expect(LEGAL_INTENT_REGEX.test('do I have a case?')).toBe(false);
    // legal-intent regex requires more specific phrasing — sanity-check one
    expect(LEGAL_INTENT_REGEX.test('should I sue them?')).toBe(true);
  });

  it('LEGAL_DISCLAIMER is the canonical safety-rail copy', () => {
    expect(LEGAL_DISCLAIMER).toMatch(/I'm not a lawyer/);
    expect(LEGAL_DISCLAIMER).toMatch(/consultation/);
  });
});
