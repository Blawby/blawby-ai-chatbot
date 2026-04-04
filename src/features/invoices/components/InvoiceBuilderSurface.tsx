import { forwardRef } from 'preact/compat';
import { useEffect, useImperativeHandle, useMemo, useRef, useState } from 'preact/hooks';
import { getOnboardingStatus, type UserDetailRecord } from '@/shared/lib/apiClient';
import { useClientsData } from '@/shared/hooks/useClientsData';
import { listMatters, type BackendMatter } from '@/features/matters/services/mattersApi';
import { InvoiceForm } from '@/features/invoices/components/InvoiceForm';
import type { InvoiceFormHandle } from '@/features/invoices/components/InvoiceForm';
import {
  getInvoice,
} from '@/features/invoices/services/invoicesService';
import type { InvoiceDetail } from '@/features/invoices/types';
import type { PendingInvoiceDraftContext } from '@/features/invoices/utils/invoiceDraftContext';
import { INVOICE_CREATE_SEND_EVENT } from '@/features/invoices/utils/invoicePageConfig';
import { Panel } from '@/shared/ui/layout/Panel';
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
  return name || email || 'Unnamed person';
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

  const [matters, setMatters] = useState<BackendMatter[]>([]);
  const [invoiceDetail, setInvoiceDetail] = useState<InvoiceDetail | null>(initialInvoice);
  const [connectedAccountId, setConnectedAccountId] = useState<string | null>(initialInvoice?.sourceInvoice.connected_account_id ?? null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
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

  useEffect(() => {
    setInvoiceDetail(initialInvoice);
    setConnectedAccountId(initialInvoice?.sourceInvoice.connected_account_id ?? null);
  }, [initialInvoice]);

  useEffect(() => {
    if (!practiceId) return;

    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);

    void (async () => {
      try {
        let resolvedInvoice = initialInvoice;

        if (mode === 'edit' && !resolvedInvoice && existingInvoiceId) {
          resolvedInvoice = await getInvoice(practiceId, existingInvoiceId, { signal: controller.signal });
          if (!resolvedInvoice) {
            if (controller.signal.aborted) return;
            setInvoiceDetail(null);
            setLoadError('Invoice not found.');
            return;
          }
        }

        if (controller.signal.aborted) return;

        setInvoiceDetail(resolvedInvoice ?? null);
        setConnectedAccountId(
          resolvedInvoice?.sourceInvoice.connected_account_id
            ?? (mode === 'create' ? null : resolvedInvoice?.connectedAccountId ?? null)
        );

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
          setLoading(false);
        }
      }
    })();

    return () => controller.abort();
  }, [existingInvoiceId, initialInvoice, mode, practiceId]);

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

  if (!practiceId) {
    return <div className="p-6 text-sm text-red-300">Practice context is missing from this route.</div>;
  }

  if (mode === 'edit' && !resolvedInvoice && !loading && !loadError) {
    return <div className="p-6 text-sm text-input-placeholder">Loading invoice...</div>;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      {displayError ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {displayError}
        </div>
      ) : null}
      {loading || (!clientsData.isLoaded && clientsData.isLoading) ? (
        <Panel className="p-6">
          <div className="text-sm text-input-placeholder">Loading invoice builder...</div>
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
