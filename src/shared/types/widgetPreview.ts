export type WidgetPreviewScenario =
  | 'messenger-start'
  | 'consultation-payment'
  | 'service-routing';

export type WidgetPreviewService = {
  id: string;
  name: string;
};

export type WidgetPreviewConfig = {
  name?: string;
  profileImage?: string | null;
  accentColor?: string;
  introMessage?: string | null;
  legalDisclaimer?: string | null;
  consultationFee?: number | null;
  paymentLinkEnabled?: boolean;
  currency?: string | null;
  billingIncrementMinutes?: number | null;
  services?: WidgetPreviewService[];
};

export type WidgetPreviewMessage = {
  type: 'blawby:widget-preview-config';
  scenario: WidgetPreviewScenario;
  payload: WidgetPreviewConfig;
};
