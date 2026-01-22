import { PlaceholderPage } from '@/shared/components/PlaceholderPage';

export const PracticeMattersPage = () => (
  <PlaceholderPage
    title="Matters"
    subtitle="Track matter progress and case milestones."
    sections={[
      {
        title: 'Matter pipeline',
        description: 'Active, pending, and completed matters.'
      }
    ]}
  />
);
