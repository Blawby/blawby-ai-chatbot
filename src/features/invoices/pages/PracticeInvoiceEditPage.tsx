import { useCallback, useMemo } from 'preact/hooks';
import { useNavigation } from '@/shared/utils/navigation';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';
import { InvoiceBuilderSurface } from '@/features/invoices/components/InvoiceBuilderSurface';

export function PracticeInvoiceEditPage({
 practiceId,
 practiceSlug,
 invoiceId,
}: {
 practiceId: string | null;
 practiceSlug: string | null;
 invoiceId: string | null;
}) {
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

 const handleBackToList = useCallback(() => {
  if (!invoicesPath) {
   showError('Invoices', 'Practice slug is missing from route context.');
   return;
  }
  navigate(invoicesPath);
 }, [invoicesPath, navigate, showError]);

 const handleSuccess = useCallback(async (updatedInvoiceId?: string | null) => {
  const nextInvoiceId = updatedInvoiceId?.trim() || invoiceId;
  if (!invoicesPath || !nextInvoiceId) {
   showError('Invoices', 'Invoice route context is missing.');
   return;
  }
  navigate(`${invoicesPath}/${encodeURIComponent(nextInvoiceId)}`);
 }, [invoiceId, invoicesPath, navigate, showError]);

 if (!practiceId) {
  return <div className="p-6 text-sm text-[rgb(var(--error-foreground))]">Practice context is missing from this route.</div>;
 }

 if (!invoiceId) {
  return <div className="p-6 text-sm text-[rgb(var(--error-foreground))]">Invoice ID is missing from this route.</div>;
 }

 return (
  <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 sm:p-6">
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
 );
}

export default PracticeInvoiceEditPage;
