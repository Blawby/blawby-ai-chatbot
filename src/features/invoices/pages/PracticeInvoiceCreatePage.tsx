import { useCallback, useMemo } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { EditorShell } from '@/shared/ui/layout';
import { useNavigation } from '@/shared/utils/navigation';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';
import { updateMatterMilestone } from '@/features/matters/services/mattersApi';
import { InvoiceBuilderSurface } from '@/features/invoices/components/InvoiceBuilderSurface';
import {
  clearPendingInvoiceDraftContext,
  readPendingInvoiceDraftContext,
} from '@/features/invoices/utils/invoiceDraftContext';
import { getValidatedInternalReturnPath } from '@/shared/utils/workspace';

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
  const { currentPractice } = usePracticeManagement({
    practiceSlug: practiceSlug ?? undefined,
    fetchPracticeDetails: true,
  });

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
  const returnTo = useMemo(() => {
    const fallback = invoicesPath ?? '/practice';
    return getValidatedInternalReturnPath(
      typeof location.query?.returnTo === 'string'
        ? location.query.returnTo
        : typeof location.query?.backTo === 'string'
          ? location.query.backTo
          : draftContext?.returnPath ?? null,
      fallback
    );
  }, [draftContext?.returnPath, invoicesPath, location.query?.backTo, location.query?.returnTo]);
  const returnPath = returnTo ?? invoicesPath;
  const canRenderBuilder = Boolean(practiceId) && (!draftId || Boolean(draftContext));

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
    <EditorShell
      title="Create Invoice"
      subtitle="Build, preview, and send an invoice."
      showBack
      backVariant="close"
      onBack={handleBackToInvoices}
      contentMaxWidth={null}
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        {draftId && !draftContext ? (
          <div className="rounded-xl border border-accent-error/30 bg-accent-error/10 px-4 py-3 text-sm text-accent-error-foreground">
            Invoice draft context was not found. Start invoice creation from the matter or invoices page again.
          </div>
        ) : null}
        {canRenderBuilder ? (
          <InvoiceBuilderSurface
            mode="create"
            practiceId={practiceId}
            initialDraftContext={draftContext}
            onClose={handleBackToInvoices}
            onSuccess={handleCreated}
            practiceName={currentPractice?.name ?? undefined}
            practiceLogoUrl={currentPractice?.logo ?? undefined}
            practiceEmail={currentPractice?.businessEmail ?? undefined}
            billingIncrementMinutes={currentPractice?.billingIncrementMinutes ?? undefined}
          />
        ) : null}
      </div>
    </EditorShell>
  );
}

export default PracticeInvoiceCreatePage;
