import type { Practice } from '@/shared/hooks/usePracticeManagement';
import type { PracticeDetails } from '@/shared/lib/apiClient';

export interface PracticeSetupStatus {
  basicsComplete: boolean;
  contactComplete: boolean;
  servicesComplete: boolean;
  payoutsComplete: boolean;
  needsSetup: boolean;
}

export const resolvePracticeSetupStatus = (
  practice: Practice | null,
  details: PracticeDetails | null
): PracticeSetupStatus => {
  const detailAddress: unknown = details?.address;
  const hasStructuredDetailAddress = Boolean(
    detailAddress &&
    typeof detailAddress === 'object' &&
    (
      ('line1' in detailAddress && typeof detailAddress.line1 === 'string' && detailAddress.line1.trim().length > 0) ||
      ('address' in detailAddress && typeof detailAddress.address === 'string' && detailAddress.address.trim().length > 0)
    )
  );
  const hasAddress = Boolean(
    (typeof detailAddress === 'string' && detailAddress.trim().length > 0)
    || hasStructuredDetailAddress
    || practice?.address?.trim()
    || practice?.city?.trim()
    || practice?.state?.trim()
    || practice?.postalCode?.trim()
    || practice?.country?.trim()
  );
  const basicsComplete = Boolean(practice?.name?.trim() && practice?.slug?.trim());
  const contactComplete = Boolean(
    (details?.businessEmail && details.businessEmail.trim().length > 0) ||
    (details?.businessPhone && details.businessPhone.trim().length > 0) ||
    (practice?.businessEmail && practice.businessEmail.trim().length > 0) ||
    (practice?.businessPhone && practice.businessPhone.trim().length > 0) ||
    hasAddress
  );
  const servicesComplete = Boolean(
    (details?.services && details.services.length > 0) ||
    (practice?.services && practice.services.length > 0)
  );
  const stripeStatus = practice?.businessOnboardingStatus;
  const payoutsComplete = stripeStatus === 'completed'
    || stripeStatus === 'not_required'
    || stripeStatus === 'skipped';
  const needsSetup = !(basicsComplete && contactComplete && servicesComplete && payoutsComplete);
  return {
    basicsComplete,
    contactComplete,
    servicesComplete,
    payoutsComplete,
    needsSetup
  };
};
