import type { Practice } from '@/shared/hooks/usePracticeManagement';
import type { PracticeDetails } from '@/shared/lib/apiClient';

export interface PracticeSetupStatus {
  basicsComplete: boolean;
  contactComplete: boolean;
  servicesComplete: boolean;
  needsSetup: boolean;
}

export const resolvePracticeSetupStatus = (
  practice: Practice | null,
  details: PracticeDetails | null
): PracticeSetupStatus => {
  const basicsComplete = Boolean(practice?.name?.trim() && practice?.slug?.trim());
  const contactComplete = Boolean(
    details &&
    (
      (details.businessEmail && details.businessEmail.trim().length > 0) ||
      (details.businessPhone && details.businessPhone.trim().length > 0) ||
      (details.address && details.address.trim().length > 0)
    )
  );
  const servicesComplete = Boolean(details?.services && details.services.length > 0);
  const needsSetup = !(basicsComplete && contactComplete && servicesComplete);
  return {
    basicsComplete,
    contactComplete,
    servicesComplete,
    needsSetup
  };
};
