import { PlaceholderPage } from '@/shared/components/PlaceholderPage';

export const PracticeHomePage = () => (
  <PlaceholderPage
    title="Home"
    subtitle="Stripe-style overview of balances, reporting, and recent activity."
    sections={[
      {
        title: 'Balances summary',
        description: 'Available vs pending funds, with instant payout status.'
      },
      {
        title: 'Reporting chart',
        description: 'Revenue trends and high-level performance.'
      },
      {
        title: 'Recent payments',
        description: 'Latest client payments across conversations and matters.'
      },
      {
        title: 'Recent payouts',
        description: 'Upcoming and completed payouts to your firm.'
      }
    ]}
  />
);
