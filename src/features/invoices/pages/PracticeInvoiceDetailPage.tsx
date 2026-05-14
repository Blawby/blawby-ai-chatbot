import type { ComponentChildren } from 'preact';
import { useCallback } from 'preact/hooks';
import { EditorShell } from '@/shared/ui/layout';
import { LoadingSpinner } from '@/shared/ui/layout/LoadingSpinner';
import { InvoiceDetailSkeleton } from '@/features/invoices/components/InvoiceDetailSkeleton';
import { formatLongDate } from '@/shared/utils/dateFormatter';
import { useNavigation } from '@/shared/utils/navigation';
import type { InvoiceDetail } from '@/features/invoices/types';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';
import { useInvoiceDetail } from '@/features/invoices/hooks/useInvoiceDetail';
import { usePracticeInvoiceDetailController } from '@/features/invoices/components/detail/PracticeInvoiceDetailView';

const renderEventDate = (value: string | null): string => (value ? formatLongDate(value) : '—');

export function PracticeInvoiceDetailPage({
  practiceId,
  practiceSlug,
  invoiceId,
  leadingAction,
  onInspector,
  inspectorOpen = false,
  showBack = true,
}: {
  practiceId: string | null;
  practiceSlug: string | null;
  invoiceId: string | null;
  leadingAction?: ComponentChildren;
  onInspector?: () => void;
  inspectorOpen?: boolean;
  showBack?: boolean;
}) {
  const { navigate } = useNavigation();
  const { currentPractice } = usePracticeManagement({
    practiceSlug: practiceSlug ?? undefined,
    fetchPracticeDetails: true,
  });
  const {
    data: detailData,
    isLoading: loading,
    error,
    refetch: refetchDetail,
  } = useInvoiceDetail(practiceId, invoiceId);
  const detail: InvoiceDetail | null = detailData ?? null;

  const handleBackToList = useCallback(() => {
    if (!practiceSlug) return;
    navigate(`/practice/${encodeURIComponent(practiceSlug)}/invoices`);
  }, [navigate, practiceSlug]);

  if (loading && !detail) {
    return <InvoiceDetailSkeleton />;
  }

  if (error && !detail) {
    return <div className="p-6 text-sm text-accent-error-light">{error}</div>;
  }

  if (!detail) {
    return <div className="p-6 text-sm text-input-placeholder">Invoice not found.</div>;
  }

  if (!practiceId) {
    return <div className="p-6 text-sm text-accent-error-light">Practice context is missing from this route.</div>;
  }

  return (
    <PracticeInvoiceDetailShell
      practiceId={practiceId}
      practiceSlug={practiceSlug}
      detail={detail}
      currentPractice={currentPractice ?? null}
      loading={loading}
      refetch={refetchDetail}
      showBack={showBack}
      leadingAction={leadingAction}
      onBack={handleBackToList}
      onInspector={onInspector}
      inspectorOpen={inspectorOpen}
    />
  );
}

interface PracticeInvoiceDetailShellProps {
  practiceId: string;
  practiceSlug: string | null;
  detail: InvoiceDetail;
  currentPractice: {
    name?: string | null;
    logo?: string | null;
    businessEmail?: string | null;
    billingIncrementMinutes?: number | null;
  } | null;
  loading: boolean;
  refetch: () => Promise<unknown>;
  showBack?: boolean;
  leadingAction?: ComponentChildren;
  onBack?: () => void;
  onInspector?: () => void;
  inspectorOpen?: boolean;
}

function PracticeInvoiceDetailShell({
  practiceId,
  practiceSlug,
  detail,
  currentPractice,
  loading,
  refetch,
  showBack,
  leadingAction,
  onBack,
  onInspector,
  inspectorOpen,
}: PracticeInvoiceDetailShellProps) {
  const { actionBar, mainContent } = usePracticeInvoiceDetailController({
    practiceId,
    practiceSlug,
    detail,
    currentPractice,
    loading,
    refetch,
  });

  return (
    <EditorShell
      title={(
        <span className="inline-flex items-center gap-2">
          {detail.invoiceNumber}
          {loading ? <LoadingSpinner size="sm" ariaLabel="Refreshing invoice" announce={false} /> : null}
        </span>
      )}
      subtitle={`Issued ${renderEventDate(detail.issueDate)} • Due ${renderEventDate(detail.dueDate)}`}
      showBack={showBack}
      onBack={onBack}
      leadingAction={leadingAction}
      onInspector={onInspector}
      inspectorOpen={inspectorOpen}
      actions={actionBar}
      contentMaxWidth={null}
    >
      {mainContent}
    </EditorShell>
  );
}
