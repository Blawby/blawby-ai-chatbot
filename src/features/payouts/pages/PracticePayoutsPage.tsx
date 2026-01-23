import { PlaceholderPage } from '@/shared/components/PlaceholderPage';

export const PracticePayoutsPage = () => (
  <PlaceholderPage
    title="Payouts"
    subtitle="Track payout timing, status, and balance movements."
    sections={[
      {
        title: 'Payouts list',
        description: 'All payouts with status and arrival dates.'
      },
      {
        title: 'Payout details',
        description: 'Breakdown of payout contents and destination.'
      },
      {
        title: 'Balances',
        description: 'Available and pending balances that drive payouts.'
      }
    ]}
  />
);
