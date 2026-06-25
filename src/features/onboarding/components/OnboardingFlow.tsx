import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useTranslation } from '@/shared/i18n/hooks';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { createPractice, getCurrentSubscription } from '@/shared/lib/apiClient';
import { getPreferencesCategory, updatePreferencesCategory } from '@/shared/lib/preferencesApi';
import type { SubscriptionPlan } from '@/shared/utils/fetchPlans';
import {
  authClient,
  updateUser,
  getSession,
  useListOrganizations
} from '@/shared/lib/authClient';
import { slugify } from '@/shared/lib/orgCreation';
import type { OnboardingPreferences } from '@/shared/types/preferences';
import type { OnboardingDraft, OnboardingStep } from '../types';
import { readDraft, writeDraft, clearDraft } from '../utils/draftStorage';
import { ProgressSidebar, ProgressPips } from './ProgressSidebar';
import AssistantTurn from './AssistantTurn';
import StageHeader from './StageHeader';
import StageFooter from './StageFooter';
import PricingView from '@/features/pricing/components/PricingView';
import AboutYouStep, { isAboutYouComplete } from '../steps/AboutYouStep';
import PracticeStep, { isPracticeComplete } from '../steps/PracticeStep';
import PaymentsStep, { isPaymentsComplete } from '../steps/PaymentsStep';
import IntakeFormStep from '../steps/IntakeFormStep';
import ShareIntakeStep, { isShareIntakeComplete } from '../steps/ShareIntakeStep';

interface ExistingMembership {
  id?: string;
  slug?: string | null;
  name?: string | null;
}

interface OnboardingFlowProps {
  onClose: () => void;
  onComplete: () => void;
  active?: boolean;
  className?: string;
  testId?: string;
}

interface OnboardingFlowRuntimeProps extends OnboardingFlowProps {
  initialStep?: OnboardingStep;
  initialDraft?: OnboardingDraft;
  initialHasActiveSubscription?: boolean;
  sessionUserName: string;
  sessionUserId?: string | null;
  requiresNameCollection: boolean;
  firstExistingMembership?: ExistingMembership;
  persistDraft?: boolean;
  enableSidebarStepSelect?: boolean;
  pricingPlanOverride?: SubscriptionPlan | null;
  loadPreferences?: (() => Promise<Pick<OnboardingPreferences, 'birthday'> | null>) | null;
  loadSubscription?: (() => Promise<boolean>) | null;
  createOrganization: (
    draft: OnboardingDraft,
    firstExistingMembership?: ExistingMembership
  ) => Promise<{ id: string; slug?: string | null } | null>;
  finalizeOnboarding: (draft: OnboardingDraft) => Promise<void>;
}

interface DebugOnboardingFlowProps {
  initialStep?: OnboardingStep;
  initialDraft: OnboardingDraft;
  hasActiveSubscription?: boolean;
  sessionUserName?: string;
  pricingPlanOverride?: SubscriptionPlan | null;
  className?: string;
  testId?: string;
}

const TOTAL_STEPS: OnboardingStep[] = [1, 2, 3, 4, 5, 6];

const CONTINUE_LABEL: Record<OnboardingStep, string> = {
  1: 'Continue → Your practice',
  2: 'Continue → Get Business',
  3: 'Continue → Payments',
  4: 'Continue → Your intake form',
  5: 'Continue → Share intake',
  6: 'Open your workspace →'
};

const CRUMB: Record<OnboardingStep, string> = {
  1: 'Step 1 of 6 · About you',
  2: 'Step 2 of 6 · Your practice',
  3: 'Step 3 of 6 · Get Business',
  4: 'Step 4 of 6 · Payments',
  5: 'Step 5 of 6 · Your intake form',
  6: 'Step 6 of 6 · Share intake'
};

const OnboardingFlowImpl = ({
  onClose,
  onComplete,
  active = true,
  className = '',
  testId,
  initialStep = 1,
  initialDraft,
  initialHasActiveSubscription = false,
  sessionUserName,
  sessionUserId,
  requiresNameCollection,
  firstExistingMembership,
  persistDraft = true,
  enableSidebarStepSelect = false,

  pricingPlanOverride = null,
  loadPreferences,
  loadSubscription,
  createOrganization,
  finalizeOnboarding
}: OnboardingFlowRuntimeProps) => {
  const { t } = useTranslation('common');
  const { showError, showSuccess } = useToastContext();

  const [step, setStep] = useState<OnboardingStep>(initialStep);
  const [hasActiveSubscription, setHasActiveSubscription] = useState(initialHasActiveSubscription);
  const [activatedOrganizationId, setActivatedOrganizationId] = useState<string | null>(null);
  const [draft, setDraft] = useState<OnboardingDraft>(() => {
    const stored = persistDraft ? readDraft() : null;
    return {
      fullName: stored?.fullName ?? initialDraft?.fullName ?? sessionUserName,
      ...(initialDraft ?? {}),
      ...(stored ?? {})
    };
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const hasLoadedPrefsRef = useRef(false);
  const activatingOrganizationIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!active || !sessionUserId || hasLoadedPrefsRef.current || !loadPreferences) return;
    void (async () => {
      try {
        const prefs = await loadPreferences();
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
  }, [active, loadPreferences, sessionUserId, sessionUserName]);

  const subscriptionOrganizationId = draft.createdOrganizationId ?? firstExistingMembership?.id ?? null;

  useEffect(() => {
    if (!active || !subscriptionOrganizationId || activatedOrganizationId === subscriptionOrganizationId) return;
    if (activatingOrganizationIdRef.current === subscriptionOrganizationId) return;
    activatingOrganizationIdRef.current = subscriptionOrganizationId;
    void (async () => {
      let didActivate = false;
      try {
        const activated = await createOrganization(draft, firstExistingMembership ?? {
          id: subscriptionOrganizationId,
          slug: draft.createdOrganizationSlug ?? null,
          name: draft.practiceName ?? null
        });
        if (activated?.id) {
          didActivate = true;
          setActivatedOrganizationId(activated.id);
          setDraft((prev) => ({
            ...prev,
            createdOrganizationId: activated.id,
            createdOrganizationSlug: activated.slug ?? prev.createdOrganizationSlug ?? firstExistingMembership?.slug ?? null,
            practiceName: prev.practiceName ?? firstExistingMembership?.name ?? ''
          }));
        }
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error('[ONBOARDING][ORG] failed to activate organization', error);
        }
      } finally {
        if (!didActivate && activatingOrganizationIdRef.current === subscriptionOrganizationId) {
          activatingOrganizationIdRef.current = null;
        }
      }
    })();
  }, [
    active,
    activatedOrganizationId,
    createOrganization,
    draft,
    firstExistingMembership,
    subscriptionOrganizationId
  ]);

  useEffect(() => {
    if (!active || !loadSubscription || !subscriptionOrganizationId || activatedOrganizationId !== subscriptionOrganizationId) return;
    let cancelled = false;
    void (async () => {
      try {
        const nextHasSubscription = await loadSubscription();
        if (!cancelled) {
          setHasActiveSubscription(nextHasSubscription);
        }
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error('[ONBOARDING][SUBSCRIPTION] failed to load current subscription', error);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [active, activatedOrganizationId, loadSubscription, subscriptionOrganizationId]);

  useEffect(() => {
    if (!firstExistingMembership?.id || draft.createdOrganizationId) return;
    setDraft((prev) => ({
      ...prev,
      createdOrganizationId: firstExistingMembership.id ?? null,
      createdOrganizationSlug: firstExistingMembership.slug ?? null,
      practiceName: prev.practiceName ?? firstExistingMembership.name ?? ''
    }));
  }, [draft.createdOrganizationId, firstExistingMembership]);

  useEffect(() => {
    if (!persistDraft) return;
    writeDraft(draft);
  }, [draft, persistDraft]);

  const handleDraftChange = (patch: Partial<OnboardingDraft>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  };

  const firstName = useMemo(() => {
    const source = (draft.fullName ?? sessionUserName).trim();
    if (!source) return '';
    return source.split(/\s+/)[0];
  }, [draft.fullName, sessionUserName]);

  const ensureOrganization = async (): Promise<string | null> => {
    if (draft.createdOrganizationId) {
      if (activatedOrganizationId === draft.createdOrganizationId) {
        return draft.createdOrganizationId;
      }
      const activated = await createOrganization(draft, firstExistingMembership);
      if (!activated?.id) {
        return null;
      }
      setActivatedOrganizationId(activated.id);
      handleDraftChange({
        createdOrganizationId: activated.id,
        createdOrganizationSlug: activated.slug ?? draft.createdOrganizationSlug ?? null
      });
      return activated.id;
    }

    const created = await createOrganization(draft, firstExistingMembership);
    if (!created?.id) {
      return null;
    }

    handleDraftChange({
      createdOrganizationId: created.id,
      createdOrganizationSlug: created.slug ?? null
    });
    setActivatedOrganizationId(created.id);
    return created.id;
  };


  const handleComplete = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await finalizeOnboarding(draft);
      showSuccess(
        t('onboarding.completed.title', 'Onboarding complete'),
        t('onboarding.completed.message', 'Welcome to Blawby.')
      );

      if (persistDraft) {
        clearDraft();
      }
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

  const handleContinue = async () => {
    if (step === 2) {
      try {
        setIsSubmitting(true);
        const orgId = await ensureOrganization();
        if (!orgId) {
          showError('Practice name required', 'Enter a practice name to continue.');
          return;
        }
      } catch (error) {
        showError('Could not create practice', error instanceof Error ? error.message : 'Please try again.');
        return;
      } finally {
        setIsSubmitting(false);
      }
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
    if (step === 1 || step === 2 || step === 6) return;
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
        return false;
      case 4:
        return !isPaymentsComplete(draft);
      case 5:
        return false; // step 5 (intake form) is always continueable
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
        background:
          'radial-gradient(ellipse 1200px 800px at 80% -10%, color-mix(in oklab, var(--accent) 18%, transparent), transparent 60%), var(--paper)'
      }}
    >
      <div className="mx-auto grid min-h-screen w-full max-w-[1440px] grid-cols-1 lg:grid-cols-[340px_1fr]">
        <ProgressSidebar
          currentStep={step}
          hasActiveSubscription={hasActiveSubscription}
          onStepSelect={enableSidebarStepSelect ? setStep : undefined}
        />

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

          {step === 3 && (
            <>
              <StageHeader
                crumb={CRUMB[3]}
                title={<>Set up <em style={{ color: 'var(--accent)', fontStyle: 'italic' }}>Business</em>.</>}
                lede={
                  <>
                    This is the same Business plan surface you&apos;ll use before heading
                    to Stripe checkout, restyled to match onboarding.
                  </>
                }
              />
              <AssistantTurn trail="shared workspace">
                <p style={{ margin: 0 }}>
                  Business gives you the shared practice workspace, pricing, and
                  billing setup this flow expects. If you&apos;re reviewing styling,
                  this step should now mirror the existing pricing screen instead
                  of a placeholder summary.
                </p>
              </AssistantTurn>
              <PricingView
                practiceId={draft.createdOrganizationId}
                planOverride={pricingPlanOverride}
                variant="onboarding"
              />
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

          {step === 2 && (
            <>
              <StageHeader
                crumb={CRUMB[2]}
                title={<>Now — what&apos;s your <em style={{ color: 'var(--accent)', fontStyle: 'italic' }}>practice</em> called?</>}
                lede={
                  <>
                    Your practice is the workspace your team and clients see. Pick a
                    name now; jurisdiction and service areas help Blawby screen
                    incoming leads against the work and locations you accept.
                  </>
                }
              />
              <AssistantTurn trail="grounding context">
                <p style={{ margin: 0 }}>
                  {firstName ? <>Got it, <strong>{firstName}</strong>. </> : 'Got it. '}
                  Add the practice name clients should see. We&apos;ll use the
                  jurisdiction, service areas, and practice type to qualify leads
                  before they reach your workspace.
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

          {step === 4 && (
            <>
              <StageHeader
                crumb={CRUMB[4]}
                title={<>Get <em style={{ color: 'var(--accent)', fontStyle: 'italic' }}>paid</em> — properly.</>}
                lede={
                  <>
                    You&apos;ll connect Stripe from your workspace so you can accept
                    payments and receive payouts. Stripe will verify your business
                    and representative details before enabling payouts.
                  </>
                }
              />
              <AssistantTurn trail="why now matters">
                <p style={{ margin: 0 }}>
                  Once your practice is live, the &ldquo;Connect Stripe&rdquo; banner in your
                  workspace is the fastest way to finish setup. If you&apos;re not ready
                  this second, you can come back and complete verification there.
                </p>
              </AssistantTurn>
              <PaymentsStep draft={draft} />
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
                title={<>Your intake form is <em style={{ color: 'var(--accent)', fontStyle: 'italic' }}>ready.</em></>}
                lede={
                  <>
                    This is what clients see when they reach out. The required fields
                    gate submission; the AI collects the rest to strengthen the case.
                    You can add custom questions any time from Settings.
                  </>
                }
              />
              <AssistantTurn trail="seeded for your practice">
                <p style={{ margin: 0 }}>
                  I&apos;ve set up a general consultation intake tuned to your practice areas.
                  Once you&apos;re in your workspace you can rename it, add custom fields, or
                  create forms for different matter types.
                </p>
              </AssistantTurn>
              <IntakeFormStep draft={draft} />
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

export const OnboardingFlow = ({
  onClose,
  onComplete,
  active = true,
  className = '',
  testId
}: OnboardingFlowProps) => {
  const { session } = useSessionContext();

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

  const orgsHook = useListOrganizations() as { data?: unknown };
  const memberships = useMemo(() => {
    const raw = orgsHook?.data;
    if (Array.isArray(raw)) return raw;
    if (raw && typeof raw === 'object' && Array.isArray((raw as { data?: unknown }).data)) {
      return (raw as { data: unknown[] }).data;
    }
    return [];
  }, [orgsHook?.data]);
  const firstExistingMembership = memberships[0] as ExistingMembership | undefined;

  return (
    <OnboardingFlowImpl
      onClose={onClose}
      onComplete={onComplete}
      active={active}
      className={className}
      testId={testId}
      sessionUserName={sessionUserName}
      sessionUserId={sessionUserId}
      requiresNameCollection={requiresNameCollection}
      firstExistingMembership={firstExistingMembership}
      persistDraft
      loadPreferences={() => getPreferencesCategory<OnboardingPreferences>('onboarding')}
      loadSubscription={async () => Boolean(await getCurrentSubscription())}
      createOrganization={async (draft, membership) => {
        const existingOrganizationId = membership?.id ?? draft.createdOrganizationId;
        if (existingOrganizationId) {
          await authClient.organization.setActive({ organizationId: existingOrganizationId });
          return {
            id: existingOrganizationId,
            slug: membership?.slug ?? draft.createdOrganizationSlug ?? null
          };
        }

        const name = (draft.practiceName ?? '').trim();
        if (!name) return null;

        // Use the canonical backend practice creation endpoint — this creates
        // the org, practice details, emits PracticeCreated, and seeds the
        // default intake template in one atomic call.
        const practice = await createPractice({
          name,
          slug: slugify(name),
          description: draft.description ?? undefined,
          supportedStates: draft.jurisdiction
            ? [{ country: 'US', states: [draft.jurisdiction] }]
            : [],
          metadata: {
            practiceAreas: draft.practiceAreas ?? [],
            practiceTypes: draft.practiceTypes ?? [],
            barNumber: draft.barNumber ?? '',
            jurisdictions: draft.jurisdiction ? [draft.jurisdiction] : [],
          },
        });

        if (!practice?.id) {
          throw new Error('Practice was not created');
        }

        // Activate the new org in the Better Auth session.
        await authClient.organization.setActive({ organizationId: practice.id });

        return { id: practice.id, slug: practice.slug ?? slugify(name) };
      }}
      finalizeOnboarding={async (draft) => {
        await updatePreferencesCategory('onboarding', {
          birthday: draft.birthday ?? '',
          primary_use_case: 'messaging',
          product_usage: ['messaging'],
          completed: true
        });

        const trimmedName = (draft.fullName ?? '').trim();
        const updatePayload: Record<string, unknown> = { onboardingComplete: true };
        if (trimmedName) updatePayload.name = trimmedName;
        if (draft.birthday) updatePayload.dob = draft.birthday;
        await updateUser(updatePayload);
        await getSession().catch(() => undefined);
      }}
    />
  );
};

export const DebugOnboardingFlow = ({
  initialStep = 2,
  initialDraft,
  hasActiveSubscription = false,
  sessionUserName = initialDraft.fullName ?? 'Sarah Chen',
  pricingPlanOverride = null,
  className = '',
  testId = 'debug-onboarding-flow'
}: DebugOnboardingFlowProps) => {
  return (
    <OnboardingFlowImpl
      onClose={() => undefined}
      onComplete={() => undefined}
      active
      className={className}
      testId={testId}
      initialStep={initialStep}
      initialDraft={initialDraft}
      initialHasActiveSubscription={hasActiveSubscription}
      sessionUserName={sessionUserName}
      pricingPlanOverride={pricingPlanOverride}
      sessionUserId={null}
      requiresNameCollection={false}
      firstExistingMembership={{
        id: initialDraft.createdOrganizationId ?? 'debug-practice-id',
        slug: initialDraft.createdOrganizationSlug ?? 'debug-practice',
        name: initialDraft.practiceName ?? 'Debug Practice'
      }}
      persistDraft={false}
      enableSidebarStepSelect

      loadPreferences={null}
      loadSubscription={null}
      createOrganization={async (draft, membership) => {
        const name = (draft.practiceName ?? '').trim();
        if (!name) return null;
        return {
          id: membership?.id ?? 'debug-practice-id',
          slug: membership?.slug ?? 'debug-practice'
        };
      }}
      finalizeOnboarding={async () => undefined}
    />
  );
};

export default OnboardingFlow;
