import { useEffect, type StateUpdater, type Dispatch } from 'preact/hooks';
import type { Practice } from '@/shared/hooks/usePracticeManagement';

export type EditPracticeFormState = {
 name: string;
 slug: string;
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
 setEditPracticeForm
}: {
 practice: Practice | null;
 setEditPracticeForm: Dispatch<StateUpdater<EditPracticeFormState>>;
}) => {
 useEffect(() => {
  if (!practice) return;
  setEditPracticeForm({
   name: practice.name,
   slug: practice.slug || '',
   logo: practice.logo || ''
  });
 }, [practice, setEditPracticeForm]);
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
