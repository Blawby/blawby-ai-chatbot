import { describe, expect, it } from 'vitest';
import {
  applyConsultationPatchToMetadata,
  hasCoreIntakeFields,
  isIntakeReadyForSubmission,
  isIntakeSubmittable,
  resolveConsultationState,
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

  it('preserves payment link URL in submission metadata for retry handoff', () => {
    const metadata = applyConsultationPatchToMetadata(
      null,
      {
        submission: {
          intakeUuid: '11111111-1111-4111-8111-111111111111',
          paymentRequired: true,
          paymentLinkUrl: 'https://buy.stripe.com/test_123',
        },
      },
      { mirrorLegacyFields: true }
    );

    expect(metadata.intakePaymentLinkUrl).toBe('https://buy.stripe.com/test_123');
    expect(resolveConsultationState(metadata)?.submission.paymentLinkUrl).toBe('https://buy.stripe.com/test_123');
  });
});
