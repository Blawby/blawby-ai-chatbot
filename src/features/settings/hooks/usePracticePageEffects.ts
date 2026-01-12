import { useEffect, type StateUpdater, type Dispatch } from 'preact/hooks';
import type { Practice } from '@/shared/hooks/usePracticeManagement';

export type EditPracticeFormState = {
  name: string;
  slug: string;
  businessEmail: string;
  consultationFee: number | undefined;
  logo: string;
};

type ShowToast = (title: string, message?: string) => void;

export const useLeadQueueAutoLoad = (loadLeadQueue: () => Promise<void> | void) => {
  useEffect(() => {
    void loadLeadQueue();
  }, [loadLeadQueue]);
};

export const usePracticeMembersSync = ({
  practice,
  setEditPracticeForm,
  fetchMembers,
  showError
}: {
  practice: Practice | null;
  setEditPracticeForm: Dispatch<StateUpdater<EditPracticeFormState>>;
  fetchMembers: (practiceId: string) => Promise<void>;
  showError: ShowToast;
}) => {
  useEffect(() => {
    if (!practice) return;
    setEditPracticeForm({
      name: practice.name,
      slug: practice.slug || '',
      businessEmail: practice.businessEmail ?? '',
      consultationFee: typeof practice.consultationFee === 'number'
        ? practice.consultationFee
        : undefined,
      logo: practice.logo || ''
    });

    const fetchMembersData = async () => {
      try {
        await fetchMembers(practice.id);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        showError(message || 'Failed to fetch practice members');
      }
    };

    void fetchMembersData();
  }, [practice, fetchMembers, setEditPracticeForm, showError]);
};

export const usePracticeSyncParamRefetch = ({
  location,
  practiceId,
  refetch,
  showSuccess
}: {
  location: unknown;
  practiceId: string | null | undefined;
  refetch: () => Promise<void>;
  showSuccess: ShowToast;
}) => {
  useEffect(() => {
    const syncParam = (() => {
      const q = (location as { query?: Record<string, unknown> } | undefined)?.query;
      if (q && typeof q === 'object' && 'sync' in q) {
        const v = q['sync'] as unknown;
        return Array.isArray(v) ? v[0] : (v as string | undefined);
      }
      if (typeof window !== 'undefined') {
        return new URLSearchParams(window.location.search).get('sync') ?? undefined;
      }
      return undefined;
    })();

    if (String(syncParam) === '1' && practiceId) {
      refetch()
        .then(() => {
          showSuccess('Subscription updated', 'Your subscription status has been refreshed.');
        })
        .catch((error) => {
          console.error('Failed to refresh subscription:', error);
        })
        .finally(() => {
          if (typeof window !== 'undefined') {
            const newUrl = new URL(window.location.href);
            newUrl.searchParams.delete('sync');
            window.history.replaceState({}, '', newUrl.toString());
          }
        });
    }
  }, [location, practiceId, refetch, showSuccess]);
};
