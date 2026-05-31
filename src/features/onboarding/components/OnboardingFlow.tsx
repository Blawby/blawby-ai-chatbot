import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useTranslation } from '@/shared/i18n/hooks';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { getPreferencesCategory, updatePreferencesCategory } from '@/shared/lib/preferencesApi';
import {
  authClient,
  updateUser,
  getSession,
  useListOrganizations
} from '@/shared/lib/authClient';
import { slugify, unwrapCreated } from '@/shared/lib/orgCreation';
import type { OnboardingPreferences } from '@/shared/types/preferences';
import type { OnboardingDraft, OnboardingStep } from '../types';
import { readDraft, writeDraft, clearDraft } from '../utils/draftStorage';
import { ProgressSidebar, ProgressPips } from './ProgressSidebar';
import AssistantTurn from './AssistantTurn';
import StageHeader from './StageHeader';
import StageFooter from './StageFooter';
import AboutYouStep, { isAboutYouComplete } from '../steps/AboutYouStep';
import PracticeStep, { isPracticeComplete } from '../steps/PracticeStep';
import HowYouWorkStep, { isHowYouWorkComplete } from '../steps/HowYouWorkStep';
import PaymentsStep, { isPaymentsComplete } from '../steps/PaymentsStep';
import ServicesStep, { isServicesComplete } from '../steps/ServicesStep';
import ShareIntakeStep, { isShareIntakeComplete } from '../steps/ShareIntakeStep';

interface OnboardingFlowProps {
  onClose: () => void;
  onComplete: () => void;
  active?: boolean;
  className?: string;
  testId?: string;
}

const TOTAL_STEPS: OnboardingStep[] = [1, 2, 3, 4, 5, 6];

/** Continue-button labels referenced by step, for the conversational handoff. */
const CONTINUE_LABEL: Record<OnboardingStep, string> = {
  1: 'Continue → Your practice',
  2: 'Continue → How you work',
  3: 'Continue → Payments',
  4: 'Continue → Services',
  5: 'Continue → Share intake',
  6: 'Open your workspace →'
};

/** Stage-header crumb per step. */
const CRUMB: Record<OnboardingStep, string> = {
  1: 'Step 1 of 6 · About you',
  2: 'Step 2 of 6 · Your practice',
  3: 'Step 3 of 6 · How you work',
  4: 'Step 4 of 6 · Payments',
  5: 'Step 5 of 6 · Services',
  6: 'Step 6 of 6 · Share intake'
};

/**
 * 6-step conversational onboarding (Onboarding.html).
 *
 * Two-column layout: 340px progress sidebar left, stage main right. State is
 * a single step pointer (1..6) plus a persistent draft that mirrors to
 * localStorage so reloads don't lose answers. Each step decides its own
 * "Continue" enablement via a `isXComplete(draft)` predicate.
 *
 * Side effects:
 *   - Step 2 creates the org via `authClient.organization.create` and sets it
 *     active; the created id/slug are stored back in the draft so we don't
 *     re-create on Back navigation.
 *   - Step 6 finalizes by writing onboarding preferences, marking the user
 *     `onboardingComplete: true`, clearing the draft, and redirecting.
 */
export const OnboardingFlow = ({
  onClose,
  onComplete,
  active = true,
  className = '',
  testId
}: OnboardingFlowProps) => {
  const { t } = useTranslation('common');
  const { showError, showSuccess } = useToastContext();
  const { session } = useSessionContext();

  // Snapshot the session user's name once so re-renders during onboarding
  // don't keep clobbering the draft from a stale source.
  const sessionUserSnapshotRef = useRef<{ id?: string; name?: string }>({});
  const sessionUserId = session?.user?.id;
  if (sessionUserId && sessionUserSnapshotRef.current.id !== sessionUserId) {
    sessionUserSnapshotRef.current = {
      id: sessionUserId,
      name: session?.user?.name ?? ''
    };
  }
  const sessionUserName = sessionUserSnapshotRef.current.name ?? '';
  const requiresNameCollection = sessionUserName.trim().length === 0;

  // Reactive list of existing memberships — if the user already belongs to an
  // org we skip the org-create call in step 2 (just keep their existing one).
  const orgsHook = useListOrganizations() as { data?: unknown; isPending?: boolean };
  const memberships = useMemo(() => {
    const raw = orgsHook?.data;
    if (Array.isArray(raw)) return raw;
    if (raw && typeof raw === 'object' && Array.isArray((raw as { data?: unknown }).data)) {
      return (raw as { data: unknown[] }).data;
    }
    return [];
  }, [orgsHook?.data]);
  const firstExistingMembership = memberships[0] as
    | { id?: string; slug?: string | null; name?: string | null }
    | undefined;

  // Step pointer (1..6).
  const [step, setStep] = useState<OnboardingStep>(1);

  // Persistent draft. Initial value comes from localStorage (if present + not
  // expired), then gets seeded from session/membership for missing fields.
  const [draft, setDraft] = useState<OnboardingDraft>(() => {
    const stored = readDraft();
    return {
      fullName: stored?.fullName ?? sessionUserName,
      ...(stored ?? {})
    };
  });

  // One-shot prefs hydration — pulls server-side onboarding prefs (e.g.
  // birthday from prior partial completion) and merges into the draft.
  const hasLoadedPrefsRef = useRef(false);
  useEffect(() => {
    if (!active || !sessionUserId || hasLoadedPrefsRef.current) return;
    void (async () => {
      try {
        const prefs = await getPreferencesCategory<OnboardingPreferences>('onboarding');
        setDraft((prev) => ({
          ...prev,
          fullName: prev.fullName?.trim() || sessionUserName || prev.fullName,
          birthday: prev.birthday ?? prefs?.birthday ?? ''
        }));
      } catch (error) {
        console.error('Failed to load onboarding preferences:', error);
      } finally {
        hasLoadedPrefsRef.current = true;
      }
    })();
  }, [active, sessionUserId, sessionUserName]);

  // Seed createdOrganizationId from an existing membership so re-entering
  // onboarding doesn't try to create a second org.
  useEffect(() => {
    if (!firstExistingMembership?.id || draft.createdOrganizationId) return;
    setDraft((prev) => ({
      ...prev,
      createdOrganizationId: firstExistingMembership.id ?? null,
      createdOrganizationSlug: firstExistingMembership.slug ?? null,
      practiceName: prev.practiceName ?? firstExistingMembership.name ?? '',
      practiceSlug: prev.practiceSlug ?? firstExistingMembership.slug ?? ''
    }));
  }, [draft.createdOrganizationId, firstExistingMembership]);

  // Persist draft to localStorage every time it changes.
  useEffect(() => {
    writeDraft(draft);
  }, [draft]);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleDraftChange = (patch: Partial<OnboardingDraft>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  };

  const firstName = useMemo(() => {
    const source = (draft.fullName ?? sessionUserName).trim();
    if (!source) return '';
    return source.split(/\s+/)[0];
  }, [draft.fullName, sessionUserName]);

  /** Ensure a practice exists. Returns the org id to use downstream. */
  const ensureOrganization = async (): Promise<string | null> => {
    if (draft.createdOrganizationId) {
      return draft.createdOrganizationId;
    }
    if (firstExistingMembership?.id) {
      handleDraftChange({
        createdOrganizationId: firstExistingMembership.id,
        createdOrganizationSlug: firstExistingMembership.slug ?? null
      });
      return firstExistingMembership.id;
    }
    const name = (draft.practiceName ?? '').trim();
    if (!name) return null;
    const proposedSlug = draft.practiceSlug?.trim() || slugify(name);
    const created = unwrapCreated(
      await authClient.organization.create({
        name,
        ...(proposedSlug ? { slug: proposedSlug } : {})
      })
    );
    if (!created?.id) {
      throw new Error('Practice was not created');
    }
    await authClient.organization.setActive({ organizationId: created.id });
    handleDraftChange({
      createdOrganizationId: created.id,
      createdOrganizationSlug: created.slug ?? proposedSlug
    });
    return created.id;
  };

  /** Step 2 commit — create the org before continuing. */
  const commitPracticeStep = async (): Promise<boolean> => {
    try {
      setIsSubmitting(true);
      const orgId = await ensureOrganization();
      if (!orgId) {
        showError('Practice name required', 'Enter a practice name to continue.');
        return false;
      }
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Please try again.';
      showError('Could not create practice', message);
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  /** Step 6 commit — finalize onboarding + redirect. */
  const handleComplete = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      // 1. Persist onboarding preferences so the backend has the birthday + a
      //    `completed: true` flag for the future "did the user finish?" check.
      await updatePreferencesCategory('onboarding', {
        birthday: draft.birthday ?? '',
        primary_use_case: 'messaging',
        product_usage: ['messaging'],
        completed: true
      });

      // 2. Update the user — name (if collected this session), dob (if given),
      //    and the canonical onboardingComplete flag that the router watches.
      const trimmedName = (draft.fullName ?? '').trim();
      const updatePayload: Record<string, unknown> = { onboardingComplete: true };
      if (trimmedName) updatePayload.name = trimmedName;
      if (draft.birthday) updatePayload.dob = draft.birthday;
      await updateUser(updatePayload);

      // 3. Refresh the session so the redirect upstream sees the new flag.
      await getSession().catch(() => undefined);

      showSuccess(
        t('onboarding.completed.title', 'Onboarding complete'),
        t('onboarding.completed.message', 'Welcome to Blawby.')
      );

      clearDraft();
      onComplete();
      onClose();
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('[ONBOARDING][SAVE] failed to save onboarding data', error);
      }
      showError(
        t('onboarding.error.title', "Couldn't save"),
        t('onboarding.error.message', "Couldn't save your onboarding. Try again.")
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * Per-step "Continue" handler. Step 2 needs an async commit; step 6 calls
   * handleComplete; all others just advance the pointer.
   */
  const handleContinue = async () => {
    if (step === 2) {
      const ok = await commitPracticeStep();
      if (!ok) return;
    }
    if (step === 6) {
      await handleComplete();
      return;
    }
    const next = (step + 1) as OnboardingStep;
    if (TOTAL_STEPS.includes(next)) setStep(next);
  };

  const handleBack = () => {
    if (step <= 1) return;
    const prev = (step - 1) as OnboardingStep;
    setStep(prev);
  };

  const handleSkip = () => {
    // Skip = advance past the current step but mark optional fields untouched.
    // Step 1 has no skip (terms + name + birthday are required).
    // Step 6 has no skip (it's the finish line).
    if (step === 1 || step === 6) return;
    const next = (step + 1) as OnboardingStep;
    if (TOTAL_STEPS.includes(next)) setStep(next);
  };

  const continueDisabled = useMemo(() => {
    switch (step) {
      case 1:
        return !isAboutYouComplete(draft, requiresNameCollection);
      case 2:
        return !isPracticeComplete(draft);
      case 3:
        return !isHowYouWorkComplete(draft);
      case 4:
        return !isPaymentsComplete(draft);
      case 5:
        return !isServicesComplete(draft);
      case 6:
        return !isShareIntakeComplete(draft);
      default:
        return true;
    }
  }, [draft, requiresNameCollection, step]);

  const resolvedTestId = testId ?? 'onboarding-flow';

  return (
    <div
      className={`min-h-screen w-full ${className}`}
      data-testid={resolvedTestId}
      style={{
        background: `radial-gradient(ellipse 1200px 800px at 80% -10%, color-mix(in oklab, var(--accent) 18%, transparent), transparent 60%), var(--paper)`
      }}
    >
      <div
        className="mx-auto grid min-h-screen w-full max-w-[1440px] grid-cols-1 lg:grid-cols-[340px_1fr]"
      >
        <ProgressSidebar currentStep={step} />

        <main
          className="flex min-h-screen flex-col gap-9 px-6 py-10 lg:px-20 lg:py-16"
          style={{ maxWidth: '940px' }}
        >
          <ProgressPips currentStep={step} />

          {step === 1 && (
            <>
              <StageHeader
                crumb={CRUMB[1]}
                title={<>So, let&apos;s <em style={{ color: 'var(--accent)', fontStyle: 'italic' }}>start</em> with you.</>}
                lede={
                  <>
                    We&apos;ll use your name on engagement letters and your birthday for
                    bar-association verification later. Nothing leaves your practice
                    without your approval.
                  </>
                }
              />
              <AssistantTurn trail="private to you">
                <p style={{ margin: 0 }}>
                  I see you just signed up. Let&apos;s get the basics, then we&apos;ll set up
                  your practice — should take about <em style={{ color: 'var(--accent-deep)', fontStyle: 'italic' }}>two minutes</em>.
                </p>
              </AssistantTurn>
              <AboutYouStep
                draft={draft}
                requireName={requiresNameCollection}
                onChange={handleDraftChange}
              />
              <StageFooter
                onContinue={handleContinue}
                continueLabel={CONTINUE_LABEL[1]}
                continueDisabled={continueDisabled}
                isSubmitting={isSubmitting}
              />
            </>
          )}

          {step === 2 && (
            <>
              <StageHeader
                crumb={CRUMB[2]}
                title={<>Now — what&apos;s your <em style={{ color: 'var(--accent)', fontStyle: 'italic' }}>practice</em> called?</>}
                lede={
                  <>
                    Your practice is the workspace your team and clients see. Pick a
                    name + slug now; jurisdiction and bar # help us tune your assistant
                    to your state.
                  </>
                }
              />
              <AssistantTurn trail="grounding context">
                <p style={{ margin: 0 }}>
                  {firstName ? <>Got it, <strong>{firstName}</strong>. </> : 'Got it. '}
                  Let&apos;s name your practice. If you&apos;re solo,
                  &ldquo;Law Offices of {firstName || 'Your Name'}&rdquo; is common —
                  but anything works. You can change the public slug later.
                </p>
              </AssistantTurn>
              <PracticeStep draft={draft} onChange={handleDraftChange} />
              <StageFooter
                onBack={handleBack}
                onContinue={handleContinue}
                continueLabel={CONTINUE_LABEL[2]}
                continueDisabled={continueDisabled}
                isSubmitting={isSubmitting}
              />
            </>
          )}

          {step === 3 && (
            <>
              <StageHeader
                crumb={CRUMB[3]}
                title={<>So, what kind of <em style={{ color: 'var(--accent)', fontStyle: 'italic' }}>work</em> do you do?</>}
                lede={
                  <>
                    We&apos;ll use this to tune your intake form, pre-fill engagement
                    templates, and ground every assistant answer in <em style={{ color: 'var(--accent-deep)', fontStyle: 'italic' }}>your</em>{' '}
                    practice — not a generic legal LLM.
                  </>
                }
              />
              <AssistantTurn trail="private to you">
                <p style={{ margin: 0 }}>
                  I see <strong>{draft.practiceName || 'your practice'}</strong>
                  {draft.jurisdiction ? <> based in <strong>{draft.jurisdiction}</strong></> : null}.
                  Pick a few areas you handle most and tell me what makes your
                  practice <em style={{ color: 'var(--accent-deep)', fontStyle: 'italic' }}>actually</em> different —
                  I&apos;ll weight everything I do around that.
                </p>
              </AssistantTurn>
              <HowYouWorkStep draft={draft} onChange={handleDraftChange} />
              <StageFooter
                onSkip={handleSkip}
                onBack={handleBack}
                onContinue={handleContinue}
                continueLabel={CONTINUE_LABEL[3]}
                continueDisabled={continueDisabled}
                isSubmitting={isSubmitting}
              />
            </>
          )}

          {step === 4 && (
            <>
              <StageHeader
                crumb={CRUMB[4]}
                title={<>Get <em style={{ color: 'var(--accent)', fontStyle: 'italic' }}>paid</em> — properly.</>}
                lede={
                  <>
                    Stripe Connect powers retainers, flat fees, and trust deposits with
                    proper IOLTA separation. We&apos;ll wire it up the second you land in
                    your workspace.
                  </>
                }
              />
              <AssistantTurn trail="why now matters">
                <p style={{ margin: 0 }}>
                  Once your practice is live, the &ldquo;Connect Stripe&rdquo; banner is the
                  first thing you&apos;ll see — most lawyers wire it up in under five
                  minutes. <em style={{ color: 'var(--accent-deep)', fontStyle: 'italic' }}>No client can pay you until you do</em>,
                  so don&apos;t skip it for long.
                </p>
              </AssistantTurn>
              <PaymentsStep
                draft={draft}
                hasOrganization={Boolean(draft.createdOrganizationId)}
              />
              <StageFooter
                onSkip={handleSkip}
                onBack={handleBack}
                onContinue={handleContinue}
                continueLabel={CONTINUE_LABEL[4]}
                continueDisabled={continueDisabled}
                isSubmitting={isSubmitting}
              />
            </>
          )}

          {step === 5 && (
            <>
              <StageHeader
                crumb={CRUMB[5]}
                title={<>Pick your first <em style={{ color: 'var(--accent)', fontStyle: 'italic' }}>services</em>.</>}
                lede={
                  <>
                    These appear in your intake form, so clients can request the right
                    thing without messaging you first. Three is plenty — add more from
                    your workspace.
                  </>
                }
              />
              <AssistantTurn trail="suggested for you">
                <p style={{ margin: 0 }}>
                  Based on you picking{' '}
                  <strong>
                    {(draft.practiceAreas ?? []).slice(0, 2).join(', ') ||
                      'your practice areas'}
                  </strong>
                  , here are services other solos in your space lead with.
                  Pick what fits — you can edit any of them later.
                </p>
              </AssistantTurn>
              <ServicesStep draft={draft} onChange={handleDraftChange} />
              <StageFooter
                onSkip={handleSkip}
                onBack={handleBack}
                onContinue={handleContinue}
                continueLabel={CONTINUE_LABEL[5]}
                continueDisabled={continueDisabled}
                isSubmitting={isSubmitting}
              />
            </>
          )}

          {step === 6 && (
            <>
              <StageHeader
                crumb={CRUMB[6]}
                title={<>You&apos;re <em style={{ color: 'var(--accent)', fontStyle: 'italic' }}>live</em>.</>}
                lede={
                  <>
                    Your intake link is ready. Share it directly, embed it on your
                    site, or paste it in any reply — clients can start an intake the
                    moment you finish here.
                  </>
                }
              />
              <AssistantTurn trail="ready for clients">
                <p style={{ margin: 0 }}>
                  Everything is set up. The next thing you&apos;ll see is your
                  workspace — your intake link is already accepting traffic, and
                  I&apos;ll prompt you to <em style={{ color: 'var(--accent-deep)', fontStyle: 'italic' }}>connect Stripe</em> as
                  your first action there.
                </p>
              </AssistantTurn>
              <ShareIntakeStep draft={draft} />
              <StageFooter
                onBack={handleBack}
                onContinue={handleContinue}
                continueLabel={CONTINUE_LABEL[6]}
                continueDisabled={continueDisabled}
                isSubmitting={isSubmitting}
              />
            </>
          )}
        </main>
      </div>
    </div>
  );
};

export default OnboardingFlow;
