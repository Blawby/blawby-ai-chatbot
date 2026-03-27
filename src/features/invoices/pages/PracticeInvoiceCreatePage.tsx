import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useStore } from '@nanostores/preact';
import { useLocation } from 'preact-iso';
import { Page } from '@/shared/ui/layout/Page';
import { Panel } from '@/shared/ui/layout/Panel';
import { useNavigation } from '@/shared/utils/navigation';
import { useToastContext } from '@/shared/contexts/ToastContext';
import {
  getOnboardingStatus,
  listUserDetails,
  type UserDetailRecord,
} from '@/shared/lib/apiClient';
import { listMatters, type BackendMatter, updateMatterMilestone } from '@/features/matters/services/mattersApi';
import { InvoiceForm } from '@/features/invoices/components/InvoiceForm';
import type { InvoiceFormHandle } from '@/features/invoices/components/InvoiceForm';
import {
  clearPendingInvoiceDraftContext,
  readPendingInvoiceDraftContext,
} from '@/features/invoices/utils/invoiceDraftContext';
import { INVOICE_CREATE_SEND_EVENT } from '@/features/invoices/utils/invoicePageConfig';
import { practiceDetailsStore } from '@/shared/stores/practiceDetailsStore';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';

const PAGE_SIZE = 50;

const mergeRecordsById = <T extends { id: string }>(currentRecords: T[], incomingRecords: T[]) => {
  if (incomingRecords.length === 0) return currentRecords;
  const existingIds = new Set(currentRecords.map((record) => record.id));
  const mergedRecords = [...currentRecords];
  for (const record of incomingRecords) {
    if (existingIds.has(record.id)) continue;
    existingIds.add(record.id);
    mergedRecords.push(record);
  }
  return mergedRecords;
};

const loadFirstClientPage = async (practiceId: string, signal: AbortSignal) => {
  return listUserDetails(practiceId, { limit: PAGE_SIZE, offset: 0, signal });
};

const loadRemainingClientPages = async (
  practiceId: string,
  signal: AbortSignal,
  onPage: (records: UserDetailRecord[]) => void
) => {
  for (let offset = PAGE_SIZE; ; offset += PAGE_SIZE) {
    const response = await listUserDetails(practiceId, { limit: PAGE_SIZE, offset, signal });
    if (response.data.length === 0) break;
    onPage(response.data);
    if (response.data.length < PAGE_SIZE) break;
  }
};

const loadFirstMatterPage = async (practiceId: string, signal: AbortSignal) => {
  return listMatters(practiceId, { page: 1, limit: PAGE_SIZE, signal });
};

const loadRemainingMatterPages = async (
  practiceId: string,
  signal: AbortSignal,
  onPage: (records: BackendMatter[]) => void
) => {
  for (let page = 2; ; page += 1) {
    const pageItems = await listMatters(practiceId, { page, limit: PAGE_SIZE, signal });
    if (pageItems.length === 0) break;
    onPage(pageItems);
    if (pageItems.length < PAGE_SIZE) break;
  }
};

const getClientLabel = (client: UserDetailRecord) => {
  const name = client.user?.name?.trim();
  const email = client.user?.email?.trim();
  return name || email || 'Unnamed person';
};

export function PracticeInvoiceCreatePage({
  practiceId,
  practiceSlug,
}: {
  practiceId: string | null;
  practiceSlug: string | null;
}) {
  const location = useLocation();
  const { navigate } = useNavigation();
  const { showError } = useToastContext();
  const [clients, setClients] = useState<UserDetailRecord[]>([]);
  const [matters, setMatters] = useState<BackendMatter[]>([]);
  const [connectedAccountId, setConnectedAccountId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const builderRef = useRef<InvoiceFormHandle | null>(null);

  // Read cached practice identity — no extra requests; usePracticeManagement uses shared snapshot cache
  const { currentPractice } = usePracticeManagement({
    practiceSlug: practiceSlug ?? undefined,
    fetchPracticeDetails: true,
  });
  const practiceDetailsMap = useStore(practiceDetailsStore);
  const cachedDetails = practiceId ? (practiceDetailsMap[practiceId] ?? null) : null;

  const draftId = useMemo(() => {
    const value = location.query?.draft;
    if (!value) return null;
    return Array.isArray(value) ? value[0] ?? null : value;
  }, [location.query?.draft]);
  const draftContext = useMemo(() => {
    if (!draftId) return null;
    return readPendingInvoiceDraftContext(draftId);
  }, [draftId]);

  const invoicesPath = useMemo(() => {
    if (!practiceSlug) return null;
    return `/practice/${encodeURIComponent(practiceSlug)}/invoices`;
  }, [practiceSlug]);
  const returnPath = draftContext?.returnPath?.trim() || invoicesPath;
  const missingDraftError = draftId && !draftContext
    ? 'Invoice draft context was not found. Start invoice creation from the matter or invoices page again.'
    : null;
  const displayError = loadError ?? missingDraftError;

  useEffect(() => {
    if (!practiceId) return;
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);

    void (async () => {
      try {
        const [clientPage, matterPage, onboardingStatus] = await Promise.all([
          loadFirstClientPage(practiceId, controller.signal),
          loadFirstMatterPage(practiceId, controller.signal),
          getOnboardingStatus(practiceId, { signal: controller.signal }),
        ]);

        if (controller.signal.aborted) return;

        setClients(clientPage.data);
        setMatters(matterPage);
        setConnectedAccountId(onboardingStatus.connectedAccountId ?? null);

        void Promise.allSettled([
          loadRemainingClientPages(practiceId, controller.signal, (records) => {
            if (controller.signal.aborted) return;
            setClients((current) => mergeRecordsById(current, records));
          }),
          loadRemainingMatterPages(practiceId, controller.signal, (records) => {
            if (controller.signal.aborted) return;
            setMatters((current) => mergeRecordsById(current, records));
          }),
        ]).then((results) => {
          if (controller.signal.aborted) return;
          const rejection = results.find((result) => result.status === 'rejected');
          if (rejection && rejection.status === 'rejected') {
            setLoadError(rejection.reason instanceof Error ? rejection.reason.message : 'Failed to load invoice builder');
          }
        });
      } catch (error) {
        if ((error as DOMException)?.name === 'AbortError' || controller.signal.aborted) return;
        setLoadError(error instanceof Error ? error.message : 'Failed to load invoice builder');
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    })();

    return () => controller.abort();
  }, [practiceId]);

  useEffect(() => {
    const handleSendRequest = () => {
      builderRef.current?.requestSend();
    };
    window.addEventListener(INVOICE_CREATE_SEND_EVENT, handleSendRequest);
    return () => window.removeEventListener(INVOICE_CREATE_SEND_EVENT, handleSendRequest);
  }, []);

  const clientOptions = useMemo(() => {
    return clients.map((client) => ({
      value: client.id,
      label: getClientLabel(client),
      meta: client.user?.email ?? undefined,
    }));
  }, [clients]);

  const matterOptions = useMemo(() => {
    return matters.map((matter) => ({
      value: matter.id,
      label: matter.title?.trim() || 'Untitled matter',
      meta: matter.client_id ?? undefined,
    }));
  }, [matters]);

  const handleBackToInvoices = useCallback(() => {
    if (!returnPath) return;
    if (draftId) {
      clearPendingInvoiceDraftContext(draftId);
    }
    navigate(returnPath);
  }, [draftId, navigate, returnPath]);

  const handleCreated = useCallback(async (invoiceId?: string | null) => {
    if (!invoiceId) return;
    const milestone = draftContext?.milestoneToComplete;
    if (practiceId && draftContext?.matterId && milestone?.id) {
      const safeDueDate = milestone.dueDate?.trim();
      if (!safeDueDate) {
        showError(
          'Invoice created, but milestone status was not updated',
          'Milestone due date is missing. Please update the milestone manually.'
        );
      } else {
        try {
          await updateMatterMilestone(practiceId, draftContext.matterId, milestone.id, {
            description: milestone.description,
            amount: milestone.amount,
            due_date: safeDueDate,
            status: 'completed',
          });
        } catch (error) {
          showError(
            'Invoice created, but milestone status was not updated',
            error instanceof Error ? error.message : 'Please refresh and update the milestone manually.'
          );
        }
      }
    }
    if (draftId) {
      clearPendingInvoiceDraftContext(draftId);
    }
    if (!invoicesPath) {
      showError('Invoices', 'Practice slug is missing from route context.');
      return;
    }
    navigate(`${invoicesPath}/${encodeURIComponent(invoiceId)}`);
  }, [draftContext?.matterId, draftContext?.milestoneToComplete, draftId, invoicesPath, navigate, practiceId, showError]);

  return (
    <Page className="min-h-full">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        {displayError ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {displayError}
          </div>
        ) : null}
        {loading ? (
          <Panel className="p-6">
            <div className="text-sm text-input-placeholder">Loading invoice builder...</div>
          </Panel>
        ) : missingDraftError || !practiceId ? null : (
          <InvoiceForm
            ref={builderRef}
            mode="create"
            practiceId={practiceId}
            connectedAccountId={connectedAccountId}
            clientOptions={clientOptions}
            matterOptions={matterOptions}
            initialClientId={draftContext?.clientId ?? undefined}
            initialMatterId={draftContext?.matterId ?? undefined}
            initialLineItems={draftContext?.lineItems ?? undefined}
            initialDueDate={draftContext?.dueDate ?? undefined}
            initialNotes={draftContext?.notes ?? undefined}
            initialMemo={draftContext?.memo ?? undefined}
            initialInvoiceType={draftContext?.invoiceType ?? undefined}
            invoiceContext={draftContext?.invoiceContext ?? 'default'}
            onClose={handleBackToInvoices}
            onSuccess={handleCreated}
            closeAfterSuccess={false}
            practiceName={currentPractice?.name ?? undefined}
            practiceLogoUrl={currentPractice?.logo ?? undefined}
            practiceEmail={currentPractice?.businessEmail ?? cachedDetails?.businessEmail ?? undefined}
            billingIncrementMinutes={currentPractice?.billingIncrementMinutes ?? undefined}
          />
        )}
      </div>
    </Page>
  );
}

export default PracticeInvoiceCreatePage;
