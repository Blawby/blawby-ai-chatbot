export interface StripeConnectStatus {
  practice_uuid?: string;
  stripe_account_id?: string;
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
  details_submitted?: boolean;
}
