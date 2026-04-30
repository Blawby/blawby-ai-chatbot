import type { MinorAmount } from '../../../worker/types';
import type { IntakeTemplate } from './intake';

export type WidgetPreviewScenario =
  | 'messenger-start'
  | 'consultation-payment'
  | 'service-routing'
  | 'intake-template';

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
  consultationFee?: MinorAmount | null;
  paymentLinkEnabled?: boolean;
  currency?: string | null;
  billingIncrementMinutes?: number | null;
  services?: WidgetPreviewService[];
  intakeTemplate?: IntakeTemplate | null;
};

export type WidgetPreviewMessage = {
  type: 'blawby:widget-preview-config';
  scenario: WidgetPreviewScenario;
  payload: WidgetPreviewConfig;
};
