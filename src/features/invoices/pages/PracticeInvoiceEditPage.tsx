import { useCallback, useMemo } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { EditorShell } from '@/shared/ui/layout';
import { useNavigation } from '@/shared/utils/navigation';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';
import { InvoiceBuilderSurface } from '@/features/invoices/components/InvoiceBuilderSurface';
import { getValidatedInternalReturnPath } from '@/shared/utils/workspace';

export function PracticeInvoiceEditPage({
  practiceId,
  practiceSlug,
  invoiceId,
}: {
  practiceId: string | null;
  practiceSlug: string | null;
  invoiceId: string | null;
}) {
  const location = useLocation();
  const { navigate } = useNavigation();
  const { showError } = useToastContext();
  const { currentPractice } = usePracticeManagement({
    practiceSlug: practiceSlug ?? undefined,
    fetchPracticeDetails: true,
  });

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
          : null,
      fallback
    );
  }, [invoicesPath, location.query?.backTo, location.query?.returnTo]);

  const handleBackToList = useCallback(() => {
    navigate(returnTo);
  }, [navigate, returnTo]);

  const handleSuccess = useCallback(async (updatedInvoiceId?: string | null) => {
    const nextInvoiceId = updatedInvoiceId?.trim() || invoiceId;
    if (!invoicesPath || !nextInvoiceId) {
      showError('Invoices', 'Invoice route context is missing.');
      return;
    }
    navigate(`${invoicesPath}/${encodeURIComponent(nextInvoiceId)}`);
  }, [invoiceId, invoicesPath, navigate, showError]);

  if (!practiceId) {
    return <div className="p-6 text-sm text-accent-error-light">Practice context is missing from this route.</div>;
  }

  if (!invoiceId) {
    return <div className="p-6 text-sm text-accent-error-light">Invoice ID is missing from this route.</div>;
  }

  return (
    <EditorShell
      title="Edit Invoice"
      subtitle="Update invoice details, preview, and send settings."
      showBack
      backVariant="close"
      onBack={handleBackToList}
      contentMaxWidth={null}
    >
      <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8">
        <InvoiceBuilderSurface
          mode="edit"
          practiceId={practiceId}
          existingInvoiceId={invoiceId}
          onClose={handleBackToList}
          onSuccess={handleSuccess}
          practiceName={currentPractice?.name ?? undefined}
          practiceLogoUrl={currentPractice?.logo ?? undefined}
          practiceEmail={currentPractice?.businessEmail ?? undefined}
          billingIncrementMinutes={currentPractice?.billingIncrementMinutes ?? undefined}
        />
      </div>
    </EditorShell>
  );
}

export default PracticeInvoiceEditPage;
