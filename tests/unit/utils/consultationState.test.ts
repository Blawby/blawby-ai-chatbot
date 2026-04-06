import { describe, expect, it } from 'vitest';
import {
  hasCoreIntakeFields,
  isIntakeReadyForSubmission,
  isIntakeSubmittable,
} from '@/shared/utils/consultationState';

describe('consultationState intake readiness', () => {
  it('treats opposingParty as optional for core intake readiness', () => {
    const state = {
      description: 'Tenant dispute over lease termination',
      city: 'Austin',
      state: 'TX',
      opposingParty: null,
    };

    expect(hasCoreIntakeFields(state)).toBe(true);
    expect(isIntakeReadyForSubmission(state)).toBe(true);
  });

  it('still requires description, city, and state', () => {
    expect(hasCoreIntakeFields({
      description: 'Tenant dispute over lease termination',
      city: 'Austin',
      state: null,
    })).toBe(false);

    expect(isIntakeReadyForSubmission({
      description: 'Tenant dispute over lease termination',
      city: 'Austin',
      state: null,
    })).toBe(false);
  });

  it('keeps submittability tied to payment status only after the core fields are present', () => {
    const state = {
      description: 'Tenant dispute over lease termination',
      city: 'Austin',
      state: 'TX',
    };

    expect(isIntakeSubmittable(state, { paymentRequired: false, paymentReceived: false })).toBe(true);
    expect(isIntakeSubmittable(state, { paymentRequired: true, paymentReceived: false })).toBe(false);
    expect(isIntakeSubmittable(state, { paymentRequired: true, paymentReceived: true })).toBe(true);
  });
});
