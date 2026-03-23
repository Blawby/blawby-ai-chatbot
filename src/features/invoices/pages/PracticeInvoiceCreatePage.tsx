import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Breadcrumbs } from '@/shared/ui/navigation';
import { Page } from '@/shared/ui/layout/Page';
import { PageHeader } from '@/shared/ui/layout/PageHeader';
import { Panel } from '@/shared/ui/layout/Panel';
import { useNavigation } from '@/shared/utils/navigation';
import { useToastContext } from '@/shared/contexts/ToastContext';
import {
  getOnboardingStatus,
  listUserDetails,
  type UserDetailRecord,
} from '@/shared/lib/apiClient';
import { listMatters, type BackendMatter, updateMatterMilestone } from '@/features/matters/services/mattersApi';
import { InvoiceBuilder } from '@/features/invoices/components/InvoiceBuilder';
import {
  clearPendingInvoiceDraftContext,
  readPendingInvoiceDraftContext,
} from '@/features/invoices/utils/invoiceDraftContext';

const loadAllClients = async (practiceId: string, signal: AbortSignal) => {
  const pageSize = 50;
  let offset = 0;
  const allClients: UserDetailRecord[] = [];

  while (true) {
    const response = await listUserDetails(practiceId, { limit: pageSize, offset, signal });
    allClients.push(...response.data);
    if (response.data.length < pageSize) break;
    offset += pageSize;
  }

  return allClients;
};

const loadAllMatters = async (practiceId: string, signal: AbortSignal) => {
  const pageSize = 50;
  let page = 1;
  const allMatters: BackendMatter[] = [];

  while (true) {
    const pageItems = await listMatters(practiceId, { page, limit: pageSize, signal });
    allMatters.push(...pageItems);
    if (pageItems.length < pageSize) break;
    page += 1;
  }

  return allMatters;
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
  const pageSubtitle = draftContext?.matterId
    ? 'Draft a new invoice for this matter, review the preview, and send it when ready.'
    : 'Draft a new invoice, choose who it belongs to, and optionally link it to a matter.';

  useEffect(() => {
    if (!practiceId) return;
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);

    void Promise.all([
      loadAllClients(practiceId, controller.signal),
      loadAllMatters(practiceId, controller.signal),
      getOnboardingStatus(practiceId, { signal: controller.signal }),
    ])
      .then(([loadedClients, loadedMatters, onboardingStatus]) => {
        setClients(loadedClients);
        setMatters(loadedMatters);
        setConnectedAccountId(onboardingStatus.connectedAccountId ?? null);
      })
      .catch((error) => {
        if ((error as DOMException)?.name === 'AbortError') return;
        setLoadError(error instanceof Error ? error.message : 'Failed to load invoice builder');
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [practiceId]);

  useEffect(() => {
    if (!draftId) return;
    if (draftContext) return;
    setLoadError('Invoice draft context was not found. Start invoice creation from the matter or invoices page again.');
    setLoading(false);
  }, [draftContext, draftId]);

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
      try {
        await updateMatterMilestone(practiceId, draftContext.matterId, milestone.id, {
          description: milestone.description,
          amount: milestone.amount,
          due_date: milestone.dueDate,
          status: 'completed',
        });
      } catch (error) {
        showError(
          'Invoice created, but milestone status was not updated',
          error instanceof Error ? error.message : 'Please refresh and update the milestone manually.'
        );
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
        <Breadcrumbs
          items={[{ label: 'Invoices', href: returnPath ?? undefined }, { label: 'Create invoice' }]}
          onNavigate={navigate}
        />
        <PageHeader
          title="Create Invoice"
          subtitle={pageSubtitle}
        />
        {loadError ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {loadError}
          </div>
        ) : null}
        {loading ? (
          <Panel className="p-6">
            <div className="text-sm text-input-placeholder">Loading invoice builder...</div>
          </Panel>
        ) : draftId && !draftContext ? null : (
          <InvoiceBuilder
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
          />
        )}
      </div>
    </Page>
  );
}

export default PracticeInvoiceCreatePage;
