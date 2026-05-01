import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { EditorShell, LoadingBlock } from '@/shared/ui/layout';
import { MatterCreateForm, type MatterFormState } from '@/features/matters/components/MatterForm';
import { useNavigation } from '@/shared/utils/navigation';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';
import { usePracticeDetails } from '@/shared/hooks/usePracticeDetails';
import { usePracticeTeam } from '@/shared/hooks/usePracticeTeam';
import { useClientsData } from '@/shared/hooks/useClientsData';
import { getPracticeIntake } from '@/features/intake/api/intakesApi';
import { getConversation } from '@/shared/lib/conversationApi';
import {
  createMatter,
  type BackendMatter,
} from '@/features/matters/services/mattersApi';
import { urls } from '@/config/urls';
import { queryCache } from '@/shared/lib/queryCache';
import {
  buildCreatePayload,
  isUuid,
  prunePayload,
} from '@/features/matters/utils/matterUtils';
import { resolveIntakeTitle } from '@/features/intake/utils/intakeTitle';
import { getValidatedInternalReturnPath } from '@/shared/utils/workspace';

type PracticeMatterCreatePageProps = {
  practiceId: string | null;
  practiceSlug: string | null;
};

const resolveQueryValue = (value?: string | string[] | null) => {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
};

const invalidateMattersForPractice = (practiceId: string) => {
  queryCache.invalidate(`matters:${practiceId}:`, true);
};

export function PracticeMatterCreatePage({
  practiceId,
  practiceSlug,
}: PracticeMatterCreatePageProps) {
  const location = useLocation();
  const { navigate } = useNavigation();
  const { currentPractice } = usePracticeManagement({
    practiceSlug: practiceSlug ?? undefined,
    fetchPracticeDetails: true,
  });

  const { details: practiceDetails, hasDetails, fetchDetails } = usePracticeDetails(
    currentPractice?.id,
    currentPractice?.slug,
    false
  );
  const { members: teamMembers } = usePracticeTeam(practiceId ?? '', null, {
    enabled: Boolean(practiceId),
  });
  const clients = useClientsData(practiceId ?? '', null, null, {
    enabled: Boolean(practiceId),
  });

  const convertIntakeUuid = useMemo(
    () => resolveQueryValue(location.query?.convertIntake),
    [location.query?.convertIntake]
  );
  const returnTo = useMemo(() => {
    const fallback = practiceSlug
      ? `/practice/${encodeURIComponent(practiceSlug)}/matters`
      : '/practice';
    return getValidatedInternalReturnPath(
      resolveQueryValue(location.query?.returnTo) ?? resolveQueryValue(location.query?.backTo),
      fallback
    );
  }, [location.query?.backTo, location.query?.returnTo, practiceSlug]);

  const [convertInitialValues, setConvertInitialValues] = useState<Partial<MatterFormState> | undefined>(undefined);
  const [convertLoading, setConvertLoading] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);
  const [createdMatterId, setCreatedMatterId] = useState<string | null>(null);

  useEffect(() => {
    if (!currentPractice?.id || hasDetails) return;
    void fetchDetails();
  }, [currentPractice?.id, fetchDetails, hasDetails]);

  useEffect(() => {
    if (!convertIntakeUuid || !practiceId) {
      setConvertInitialValues(undefined);
      setConvertLoading(false);
      setConvertError(null);
      return;
    }

    const controller = new AbortController();
    setConvertLoading(true);
    setConvertError(null);
    setConvertInitialValues(undefined);

    getPracticeIntake(practiceId, convertIntakeUuid, { signal: controller.signal })
      .then((intake) => {
        const metadata = (intake.metadata ?? {}) as Record<string, unknown>;
        const description = typeof metadata.description === 'string' ? metadata.description : '';
        const opposingParty = typeof metadata.opposing_party === 'string' ? metadata.opposing_party : '';
        const applyInitialValues = (conversationMetadata?: { title?: string; intake_title?: string } | null) => {
          if (controller.signal.aborted) return;
          const title = resolveIntakeTitle(
            {
              ...metadata,
              title: conversationMetadata?.title ?? metadata.title,
              intake_title: conversationMetadata?.intake_title ?? metadata.intake_title,
            },
            'Intake matter'
          );
          setConvertInitialValues({
            title,
            description,
            opposingParty,
            urgency: intake.urgency === 'routine' || intake.urgency === 'time_sensitive' || intake.urgency === 'emergency'
              ? intake.urgency
              : '',
            status: 'engagement_pending',
            openDate: typeof intake.created_at === 'string' ? intake.created_at.slice(0, 10) : '',
          });
        };

        if (!intake.conversation_id) {
          applyInitialValues();
          return null;
        }

        return getConversation(intake.conversation_id, practiceId, { signal: controller.signal })
          .then((conversation) => {
            applyInitialValues(conversation?.user_info ?? null);
          })
          .catch((conversationError: unknown) => {
            if ((conversationError as DOMException).name === 'AbortError') return;
            console.warn('[PracticeMatterCreatePage] Failed to load intake conversation title', conversationError);
            applyInitialValues();
          });
      })
      .catch((error: unknown) => {
        if ((error as DOMException).name === 'AbortError') return;
        const message = error instanceof Error ? error.message : 'Failed to load intake details';
        setConvertError(message);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setConvertLoading(false);
        }
      });

    return () => controller.abort();
  }, [convertIntakeUuid, practiceId]);

  const clientOptions = useMemo(
    () => clients.items.map((client) => ({
      id: client.user?.id ?? client.id,
      name: client.user?.name?.trim() || client.user?.email?.trim() || 'Unnamed contact',
      email: client.user?.email ?? '',
      role: 'client' as const,
    })),
    [clients.items]
  );
  const practiceAreaOptions = useMemo(() => {
    const services = practiceDetails?.services;
    if (!Array.isArray(services)) return [];
    return services
      .filter((service): service is { id: string; name: string } => Boolean(service && typeof service === 'object'))
      .filter((service) => typeof service.id === 'string' && typeof service.name === 'string')
      .filter((service) => isUuid(service.id) && service.name.trim().length > 0)
      .map((service) => ({
        id: service.id,
        name: service.name,
        role: service.name,
      }));
  }, [practiceDetails?.services]);
  const assigneeOptions = useMemo(
    () => teamMembers.map((member) => ({
      id: member.userId,
      name: member.name?.trim() || member.email,
      email: member.email,
      image: member.image ?? null,
      role: member.role,
    })),
    [teamMembers]
  );

  const handleCreateMatter = useCallback(async (values: MatterFormState) => {
    if (!practiceId) throw new Error('Practice ID is required to create a matter.');
    if (values.clientId && !isUuid(values.clientId)) throw new Error(`Invalid client_id UUID: "${values.clientId}"`);
    if (values.practiceAreaId && !isUuid(values.practiceAreaId)) throw new Error(`Invalid practice_service_id UUID: "${values.practiceAreaId}"`);
    const created = await createMatter(practiceId, prunePayload(buildCreatePayload(values)));
    invalidateMattersForPractice(practiceId);
    setCreatedMatterId((created as BackendMatter | null)?.id ?? null);
  }, [practiceId]);

  const handleConvertIntake = useCallback(async (values: MatterFormState) => {
    if (!practiceId || !convertIntakeUuid) {
      throw new Error('Practice ID and intake UUID are required to convert an intake.');
    }

    const endpoint = `${urls.clientIntake(practiceId, convertIntakeUuid)}/convert`;
    const response = await fetch(endpoint, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        billing_type: values.billingType || undefined,
        responsible_attorney_id: values.responsibleAttorneyId || undefined,
        practice_service_id: values.practiceAreaId || undefined,
        title: values.title || undefined,
        status: values.status || 'engagement_pending',
        open_date: values.openDate || undefined,
      })
    });

    if (!response.ok) {
      const textBody = await response.text();
      throw new Error(textBody || `Intake conversion failed (HTTP ${response.status})`);
    }

    const payload = await response.json() as {
      success?: boolean;
      data?: { matter_id?: string };
      error?: string;
    };
    const matterId = payload.success ? payload.data?.matter_id ?? null : null;
    if (!matterId) {
      throw new Error(payload.error || 'Intake conversion response did not include a matter ID.');
    }

    invalidateMattersForPractice(practiceId);
    setCreatedMatterId(matterId);
  }, [convertIntakeUuid, practiceId]);

  const handleSubmit = convertIntakeUuid ? handleConvertIntake : handleCreateMatter;
  const handleClose = useCallback(() => {
    if (createdMatterId && practiceSlug) {
      navigate(`/practice/${encodeURIComponent(practiceSlug)}/matters/${encodeURIComponent(createdMatterId)}`);
      return;
    }
    navigate(returnTo);
  }, [createdMatterId, navigate, practiceSlug, returnTo]);

  const shouldDeferCreateForm = Boolean(convertIntakeUuid && convertLoading && !convertInitialValues);
  const title = convertIntakeUuid ? 'Convert Intake to Matter' : 'Create Matter';
  const subtitle = convertIntakeUuid
    ? 'Finalize intake details and convert this intake into a new matter.'
    : 'Capture matter details, billing structure, and assignment in one place.';

  return (
    <EditorShell
      title={title}
      subtitle={subtitle}
      showBack
      backVariant="close"
      onBack={() => navigate(returnTo)}
      contentMaxWidth={null}
    >
      <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        {convertError ? (
          <div className="rounded-xl border border-accent-error/30 bg-accent-error/10 px-4 py-3 text-sm text-accent-error-foreground">
            {convertError}
          </div>
        ) : null}
        {convertIntakeUuid && convertLoading && !convertInitialValues ? (
          <div className="rounded-xl border border-line-glass/30 bg-surface-card p-6">
            <LoadingBlock label="Loading intake details..." />
          </div>
        ) : null}
        {!shouldDeferCreateForm ? (
            <MatterCreateForm
              onClose={handleClose}
              onSubmit={handleSubmit}
              practiceId={practiceId}
              clients={clientOptions}
            practiceAreas={practiceAreaOptions}
            practiceAreasLoading={!practiceDetails?.services}
            assignees={assigneeOptions}
            initialValues={convertInitialValues}
            requireClientSelection={!convertIntakeUuid}
          />
        ) : null}
      </div>
    </EditorShell>
  );
}

export default PracticeMatterCreatePage;
