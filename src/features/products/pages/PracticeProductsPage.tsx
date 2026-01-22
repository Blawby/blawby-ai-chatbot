import { PlaceholderPage } from '@/shared/components/PlaceholderPage';

export const PracticeProductsPage = () => (
  <PlaceholderPage
    title="Products"
    subtitle="Configure consultation fees and payment links."
    sections={[
      {
        title: 'Consultation fee',
        description: 'Set default consultation pricing for new intakes.'
      },
      {
        title: 'Payment links',
        description: 'Create and manage custom payment links.'
      }
    ]}
  />
);
