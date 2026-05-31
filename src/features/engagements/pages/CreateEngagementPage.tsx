/**
 * CreateEngagementPage
 *
 * Thin wrapper around `EngagementWorkbench` in `mode='create'`.
 * The original page was a 931-LOC bespoke form; the entire form +
 * preview surface now lives in the workbench so create and edit share
 * one implementation.
 *
 * Route: /practice/:practiceSlug/engagements/new
 */
import { FunctionComponent } from 'preact';

import { EngagementWorkbench } from '../components/EngagementWorkbench';

export type CreateEngagementPageProps = {
  practiceId: string | null;
  initialIntakeId?: string | null;
  practiceName?: string;
  onCreated: (engagementId: string) => void;
  onCancel: () => void;
};

export const CreateEngagementPage: FunctionComponent<CreateEngagementPageProps> = ({
  practiceId,
  initialIntakeId = null,
  practiceName,
  onCreated,
  onCancel,
}) => (
  <EngagementWorkbench
    mode="create"
    practiceId={practiceId}
    initialIntakeId={initialIntakeId}
    practiceName={practiceName}
    onCreated={onCreated}
    onCancel={onCancel}
  />
);

export default CreateEngagementPage;
