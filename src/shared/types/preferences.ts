export type PreferenceCategory =
  | 'general'
  | 'notifications'
  | 'security'
  | 'account'
  | 'onboarding';

export interface GeneralPreferences {
  theme?: 'light' | 'dark' | 'system';
  accent_color?: string;
  language?: string;
  spoken_language?: string;
  timezone?: string;
  date_format?: string;
  time_format?: '12h' | '24h';
}

export interface NotificationPreferences {
  messages_push?: boolean;
  messages_email?: boolean;
  messages_mentions_only?: boolean;
  system_push?: boolean;
  system_email?: boolean;
  payments_push?: boolean;
  payments_email?: boolean;
  intakes_push?: boolean;
  intakes_email?: boolean;
  matters_push?: boolean;
  matters_email?: boolean;
  desktop_push_enabled?: boolean;
}

export interface SecurityPreferences {
  two_factor_enabled?: boolean;
  email_notifications?: boolean;
  login_alerts?: boolean;
  session_timeout?: number;
  expires_at?: string;
}

export interface AccountPreferences {
  selected_domain?: string | null;
  custom_domains?: string[] | null;
  receive_feedback_emails?: boolean;
  marketing_emails?: boolean;
  security_alerts?: boolean;
}

export type ProductUsage =
  | 'client_management'
  | 'billing'
  | 'document_management'
  | 'case_management'
  | 'communication';

export interface OnboardingPreferences {
  birthday?: string;
  primary_use_case?: string;
  use_case_additional_info?: string;
  completed?: boolean;
  product_usage?: ProductUsage[];
  welcome_modal_shown_at?: string | null;
  practice_welcome_shown_at?: string | null;
}

export interface PreferencesResponse {
  data: {
    id: string;
    user_id: string;
    general: GeneralPreferences | null;
    notifications: NotificationPreferences | null;
    security: SecurityPreferences | null;
    account: AccountPreferences | null;
    onboarding: OnboardingPreferences | null;
    product_usage?: ProductUsage[] | null;
    created_at: string;
    updated_at: string;
  };
}

export interface CategoryPreferencesResponse<T = Record<string, unknown>> {
  data: T;
}
