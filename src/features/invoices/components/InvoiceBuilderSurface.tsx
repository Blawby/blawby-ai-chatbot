import { forwardRef } from 'preact/compat';
import { useEffect, useImperativeHandle, useMemo, useRef, useState } from 'preact/hooks';
import { getOnboardingStatus, type UserDetailRecord } from '@/shared/lib/apiClient';
import { useClientsData } from '@/shared/hooks/useClientsData';
import { listMatters, type BackendMatter } from '@/features/matters/services/mattersApi';
import { InvoiceForm } from '@/features/invoices/components/InvoiceForm';
import type { InvoiceFormHandle } from '@/features/invoices/components/InvoiceForm';
import { useInvoiceDetail } from '@/features/invoices/hooks/useInvoiceDetail';
import type { InvoiceDetail } from '@/features/invoices/types';
import type { PendingInvoiceDraftContext } from '@/features/invoices/utils/invoiceDraftContext';
import { INVOICE_CREATE_SEND_EVENT } from '@/features/invoices/utils/invoicePageConfig';
import { Panel } from '@/shared/ui/layout/Panel';
import { LoadingBlock } from '@/shared/ui/layout/LoadingBlock';
import { useSessionContext } from '@/shared/contexts/SessionContext';

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
  return name || email || 'Unnamed contact';
};

export type InvoiceBuilderSurfaceMode = 'create' | 'edit';

type InvoiceBuilderSurfaceProps = {
  mode: InvoiceBuilderSurfaceMode;
  practiceId: string | null;
  initialDraftContext?: PendingInvoiceDraftContext | null;
  initialInvoice?: InvoiceDetail | null;
  existingInvoiceId?: string | null;
  onClose: () => void;
  onSuccess: (invoiceId?: string | null) => Promise<void> | void;
  practiceName?: string | null;
  practiceLogoUrl?: string | null;
  practiceEmail?: string | null;
  billingIncrementMinutes?: number | null;
};

export const InvoiceBuilderSurface = forwardRef<InvoiceFormHandle, InvoiceBuilderSurfaceProps>(({
  mode,
  practiceId,
  initialDraftContext = null,
  initialInvoice = null,
  existingInvoiceId,
  onClose,
  onSuccess,
  practiceName = null,
  practiceLogoUrl = null,
  practiceEmail = null,
  billingIncrementMinutes = null,
}, ref) => {
  const { session } = useSessionContext();
  const clientsData = useClientsData(
    practiceId ?? '',
    null,
    session?.user?.id ?? null,
    { enabled: Boolean(practiceId) }
  );

  // Edit-mode invoice fetch: only fires when we don't have initialInvoice. Uses
  // the shared useInvoiceDetail hook so this fetch coalesces with any other
  // open detail page for the same invoice (e.g. user navigated from
  // PracticeInvoiceDetailPage).
  const shouldFetchInvoice = mode === 'edit' && !initialInvoice && Boolean(existingInvoiceId);
  const {
    data: fetchedInvoice,
    isLoading: invoiceFetchLoading,
    error: invoiceFetchError,
  } = useInvoiceDetail(
    shouldFetchInvoice ? practiceId : null,
    shouldFetchInvoice ? existingInvoiceId ?? null : null,
  );

  const [matters, setMatters] = useState<BackendMatter[]>([]);
  const [invoiceDetail, setInvoiceDetail] = useState<InvoiceDetail | null>(initialInvoice);
  const [connectedAccountId, setConnectedAccountId] = useState<string | null>(initialInvoice?.sourceInvoice.connected_account_id ?? null);
  // Drives the orchestration loader (matters + onboarding). Combined with the
  // useInvoiceDetail hook's loading state to surface a single loading flag.
  const [orchestrationLoading, setOrchestrationLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loading = orchestrationLoading || (shouldFetchInvoice && invoiceFetchLoading);
  const formRef = useRef<InvoiceFormHandle | null>(null);

  useImperativeHandle(ref, () => ({
    requestSend: () => formRef.current?.requestSend(),
  }), []);

  useEffect(() => {
    const handleSendRequest = () => {
      formRef.current?.requestSend();
    };
    window.addEventListener(INVOICE_CREATE_SEND_EVENT, handleSendRequest);
    return () => window.removeEventListener(INVOICE_CREATE_SEND_EVENT, handleSendRequest);
  }, []);

  // Sync the invoice detail (initialInvoice prop OR useInvoiceDetail-fetched)
  // into the local invoiceDetail state. Local state (rather than reading the
  // hook directly) lets the form's edit-then-save flow keep transient changes.
  useEffect(() => {
    const resolvedInvoice = initialInvoice ?? fetchedInvoice ?? null;
    if (shouldFetchInvoice && fetchedInvoice === null && !invoiceFetchLoading) {
      // Hook returned null definitively (not just still-loading) — treat as 404.
      setInvoiceDetail(null);
      setLoadError('Invoice not found.');
      return;
    }
    setInvoiceDetail(resolvedInvoice);
    setConnectedAccountId(
      resolvedInvoice?.sourceInvoice.connected_account_id
        ?? (mode === 'create' ? null : resolvedInvoice?.connectedAccountId ?? null)
    );
  }, [fetchedInvoice, initialInvoice, invoiceFetchLoading, mode, shouldFetchInvoice]);

  useEffect(() => {
    if (invoiceFetchError) {
      setLoadError(invoiceFetchError);
    }
  }, [invoiceFetchError]);

  // Matters + onboarding orchestration. Stays inline (Promise.all coordination
  // + paginated tail loader). Could be split into two useQuery hooks in a
  // follow-up if either surface needs cross-component dedup.
  useEffect(() => {
    if (!practiceId) return;

    const controller = new AbortController();
    setOrchestrationLoading(true);
    setLoadError((current) => current === 'Invoice not found.' ? current : null);

    void (async () => {
      try {
        const [matterPage, onboardingStatus] = await Promise.all([
          loadFirstMatterPage(practiceId, controller.signal),
          mode === 'create'
            ? getOnboardingStatus(practiceId, { signal: controller.signal })
            : Promise.resolve(null),
        ]);

        if (controller.signal.aborted) return;

        setMatters(matterPage);

        if (mode === 'create') {
          setConnectedAccountId(onboardingStatus?.connectedAccountId ?? null);
        }

        void loadRemainingMatterPages(practiceId, controller.signal, (records) => {
          if (controller.signal.aborted) return;
          setMatters((current) => mergeRecordsById(current, records));
        }).catch((error) => {
          if (controller.signal.aborted) return;
          setLoadError(error instanceof Error ? error.message : 'Failed to load invoice builder');
        });
      } catch (error) {
        if ((error as DOMException)?.name === 'AbortError' || controller.signal.aborted) return;
        setLoadError(error instanceof Error ? error.message : 'Failed to load invoice builder');
      } finally {
        if (!controller.signal.aborted) {
          setOrchestrationLoading(false);
        }
      }
    })();

    return () => controller.abort();
  }, [mode, practiceId]);

  const draftContext = mode === 'create' ? initialDraftContext ?? null : null;
  const clientOptions = useMemo(() => {
    return (clientsData.items as UserDetailRecord[]).map((client) => ({
      value: client.id,
      label: getClientLabel(client),
      meta: client.user?.email ?? undefined,
    }));
  }, [clientsData.items]);

  const matterOptions = useMemo(() => {
    return matters.map((matter) => ({
      value: matter.id,
      label: matter.title?.trim() || 'Untitled matter',
      meta: matter.client_id ?? undefined,
    }));
  }, [matters]);

  const resolvedInvoice = mode === 'edit' ? invoiceDetail : null;
  const resolvedConnectedAccountId = mode === 'edit'
    ? resolvedInvoice?.sourceInvoice.connected_account_id ?? connectedAccountId
    : connectedAccountId;
  const resolvedPracticeEmail = practiceEmail ?? undefined;
  const resolvedPracticeLogoUrl = practiceLogoUrl ?? undefined;
  const resolvedPracticeBillingIncrementMinutes = billingIncrementMinutes ?? undefined;

  const displayError = loadError ?? clientsData.error;
  const shouldShowLoading = loading || clientsData.isLoading;

  if (!practiceId) {
    return <div className="p-6 text-sm text-red-300">Practice context is missing from this route.</div>;
  }

  if (mode === 'edit' && !resolvedInvoice && !loading && !loadError) {
    return <div className="p-6 text-sm text-input-placeholder">Invoice not found</div>;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      {displayError ? (
        <div className="rounded-xl border border-accent-error/30 bg-accent-error/10 px-4 py-3 text-sm text-accent-error-foreground">
          {displayError}
        </div>
      ) : null}
      {shouldShowLoading ? (
        <Panel className="p-6">
          <LoadingBlock />
        </Panel>
      ) : mode === 'edit' && !resolvedInvoice ? null : (
        <InvoiceForm
          ref={formRef}
          mode={mode}
          practiceId={practiceId}
          connectedAccountId={resolvedConnectedAccountId}
          clientOptions={clientOptions}
          matterOptions={matterOptions}
          initialClientId={mode === 'edit' ? resolvedInvoice?.sourceInvoice.client_id : draftContext?.clientId ?? undefined}
          initialMatterId={mode === 'edit' ? resolvedInvoice?.sourceInvoice.matter_id ?? undefined : draftContext?.matterId ?? undefined}
          initialLineItems={mode === 'edit' ? resolvedInvoice?.lineItems : draftContext?.lineItems ?? undefined}
          initialDueDate={
            mode === 'edit'
              ? resolvedInvoice?.dueDate ? resolvedInvoice.dueDate.slice(0, 10) : undefined
              : draftContext?.dueDate ?? undefined
          }
          initialNotes={mode === 'edit' ? resolvedInvoice?.notes ?? undefined : draftContext?.notes ?? undefined}
          initialMemo={mode === 'edit' ? resolvedInvoice?.memo ?? undefined : draftContext?.memo ?? undefined}
          initialInvoiceType={mode === 'edit' ? resolvedInvoice?.sourceInvoice.invoice_type : draftContext?.invoiceType ?? undefined}
          existingInvoiceId={mode === 'edit' ? (existingInvoiceId ?? resolvedInvoice?.id ?? undefined) : undefined}
          closeAfterSuccess={false}
          onClose={onClose}
          onSuccess={onSuccess}
          practiceName={practiceName ?? undefined}
          practiceLogoUrl={resolvedPracticeLogoUrl}
          practiceEmail={resolvedPracticeEmail}
          billingIncrementMinutes={resolvedPracticeBillingIncrementMinutes}
        />
      )}
    </div>
  );
});

export default InvoiceBuilderSurface;
