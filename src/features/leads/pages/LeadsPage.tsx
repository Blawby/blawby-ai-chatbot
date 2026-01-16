import type { ComponentChildren } from 'preact';
import { LeadReviewQueue } from '@/features/leads/components/LeadReviewQueue';
import type { MatterTransitionResult } from '@/shared/hooks/usePracticeManagement';

interface LeadsPageProps {
  practiceId: string | null;
  canReviewLeads: boolean;
  acceptMatter: (practiceId: string, matterId: string) => Promise<MatterTransitionResult>;
  rejectMatter: (practiceId: string, matterId: string, reason?: string) => Promise<MatterTransitionResult>;
  className?: string;
  header?: ComponentChildren;
}

export const LeadsPage = ({
  practiceId,
  canReviewLeads,
  acceptMatter,
  rejectMatter,
  className = '',
  header
}: LeadsPageProps) => {
  return (
    <div className={`h-full flex flex-col ${className}`}>
      <div className="px-6 py-6 border-b border-gray-200 dark:border-gray-800">
        {header ?? (
          <div>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Leads</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Review paid intakes and decide who to bring into the conversation.
            </p>
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <LeadReviewQueue
          practiceId={practiceId}
          canReviewLeads={canReviewLeads}
          acceptMatter={acceptMatter}
          rejectMatter={rejectMatter}
          showHeader={false}
        />
      </div>
    </div>
  );
};
