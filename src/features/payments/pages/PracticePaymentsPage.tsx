import { PlaceholderPage } from '@/shared/components/PlaceholderPage';

export const PracticePaymentsPage = () => (
  <PlaceholderPage
    title="Payments"
    subtitle="Manage payment activity, refunds, and disputes."
    sections={[
      {
        title: 'Payments list',
        description: 'Searchable transaction history with export and filters.'
      },
      {
        title: 'Payment details',
        description: 'Refunds, disputes, and capture actions live here.'
      }
    ]}
  />
);
