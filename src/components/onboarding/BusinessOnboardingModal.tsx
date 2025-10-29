import { useState } from 'preact/hooks';
import Modal from '../Modal';
import { Button } from '../ui/Button';
import { Logo } from '../ui/Logo';
import { Input, Textarea, Switch, EmailInput, PhoneInput, URLInput, FileInput } from '../ui/input';

type OnboardingStep =
  | 'welcome'
  | 'firm-basics'
  | 'trust-account-intro'
  | 'stripe-onboarding'
  | 'business-details'
  | 'review-and-launch';

const STEP_ORDER: OnboardingStep[] = [
  'welcome',
  'firm-basics',
  'trust-account-intro',
  'stripe-onboarding',
  'business-details',
  'review-and-launch'
];

const STEP_TITLES: Record<OnboardingStep, string> = {
  welcome: 'Welcome to Blawby',
  'firm-basics': 'Tell us about your firm',
  'trust-account-intro': 'Connect your trust account for payouts',
  'stripe-onboarding': 'Connect with Stripe',
  'business-details': 'Configure your business profile',
  'review-and-launch': 'Review and launch'
};

const STEP_DESCRIPTIONS: Record<OnboardingStep, string> = {
  welcome: "Let's get your AI intake assistant set up. This will only take a few minutes.",
  'firm-basics': "We'll use this information to build your payment system and client-facing experience.",
  'trust-account-intro': 'To stay IOLTA-compliant, we need to securely verify your identity and link your trust account. All client payments will be deposited here.',
  'stripe-onboarding': "You'll be redirected to Stripe to complete your account setup and link your trust account.",
  'business-details': "Set up your services, intake questions, and preferences.",
  'review-and-launch': 'Review your setup and launch your intake assistant.'
};

interface BusinessOnboardingModalProps {
  isOpen: boolean;
  organizationId: string;
  organizationName?: string;
  fallbackContactEmail?: string;
  onClose: () => void;
  onCompleted?: () => Promise<void> | void;
}

const BusinessOnboardingModal = ({
  isOpen,
  organizationId: _organizationId,
  organizationName,
  fallbackContactEmail,
  onClose,
  onCompleted
}: BusinessOnboardingModalProps) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Form data state
  const [formData, setFormData] = useState({
    firmName: '',
    contactEmail: fallbackContactEmail || '',
    contactPhone: '',
    website: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    postalCode: '',
    country: '',
    profileImage: '',
    primaryColor: '#2563eb',
    accentColor: '#3b82f6',
    introMessage: '',
    overview: '',
    isPublic: false
  });

  const currentStep = STEP_ORDER[currentStepIndex];

  const handleStepContinue = async () => {
    setError(null);
    setLoading(true);

    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    if (currentStepIndex < STEP_ORDER.length - 1) {
      setCurrentStepIndex(currentStepIndex + 1);
    } else {
      // Final step - complete onboarding
      try {
        localStorage.removeItem('businessSetupPending');
        localStorage.setItem('businessOnboardingCompleted', 'true');
        
        if (onCompleted) {
          await onCompleted();
        }
        onClose();
      } catch (err) {
        console.error('Failed to complete onboarding:', err);
      }
    }
    
    setLoading(false);
  };

  const handleBack = () => {
    if (currentStepIndex === 0) {
      onClose();
      return;
    }
    setCurrentStepIndex(Math.max(currentStepIndex - 1, 0));
    setError(null);
  };

  const renderWelcomeStep = () => (
    <div className="space-y-4">
      <ul className="space-y-3 text-sm text-gray-600 dark:text-gray-300">
        <li className="flex items-start gap-3">
          <span className="text-accent-500 mt-0.5 leading-none">•</span>
          <span>Configure your business profile and branding</span>
        </li>
        <li className="flex items-start gap-3">
          <span className="text-accent-500 mt-0.5 leading-none">•</span>
          <span>Set up services and custom intake questions</span>
        </li>
        <li className="flex items-start gap-3">
          <span className="text-accent-500 mt-0.5 leading-none">•</span>
          <span>Launch your AI-powered intake assistant</span>
        </li>
      </ul>
    </div>
  );

  const renderFirmBasicsStep = () => (
    <div className="space-y-6">
      <div className="space-y-4">
        <Input
          label="Business name"
          value={formData.firmName}
          onChange={(value) => setFormData(prev => ({ ...prev, firmName: value }))}
          required
        />
        <URLInput
          label="Website URL (optional)"
          value={formData.website}
          onChange={(value) => setFormData(prev => ({ ...prev, website: value }))}
          placeholder="https://yourbusiness.com"
        />
        <PhoneInput
          label="Business phone number"
          value={formData.contactPhone}
          onChange={(value) => setFormData(prev => ({ ...prev, contactPhone: value }))}
          placeholder="Enter your business phone number"
          required
        />
        <EmailInput
          label="Business email address"
          value={formData.contactEmail}
          onChange={(value) => setFormData(prev => ({ ...prev, contactEmail: value }))}
          placeholder="Enter your business email"
          required
        />
        <FileInput
          label="Upload logo (optional)"
          description="Upload a square logo (PNG, JPG, or WebP). Maximum size 5 MB."
          accept="image/*"
          multiple={false}
          value={[]}
          onChange={() => {}} // Placeholder - no actual upload
        />
      </div>
    </div>
  );

  const renderTrustAccountIntroStep = () => (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <span className="text-green-500 text-lg">✅</span>
          <span className="text-sm text-gray-600 dark:text-gray-300">Bank-level encryption</span>
        </div>
        <div className="flex items-start gap-3">
          <span className="text-green-500 text-lg">✅</span>
          <span className="text-sm text-gray-600 dark:text-gray-300">IOLTA trust compliance</span>
        </div>
        <div className="flex items-start gap-3">
          <span className="text-green-500 text-lg">✅</span>
          <span className="text-sm text-gray-600 dark:text-gray-300">No funds touch Blawby</span>
        </div>
      </div>
      
      <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 p-4">
        <div className="flex items-start gap-3">
          <span className="text-amber-600 dark:text-amber-400 text-lg">⚖️</span>
          <p className="text-sm text-amber-800 dark:text-amber-200">
            Do not use your operating account for this step.
          </p>
        </div>
      </div>
    </div>
  );

  const renderStripeOnboardingStep = () => (
    <div className="space-y-6">
      <div className="text-center">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          You’ll be redirected to Stripe to complete your account setup and link your trust account.
        </p>
      </div>
      
      <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20 p-6">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-4 bg-blue-500 rounded-full flex items-center justify-center">
            <span className="text-white text-xl">💳</span>
          </div>
          <h3 className="text-lg font-medium text-blue-900 dark:text-blue-100 mb-2">
            Connect with Stripe
          </h3>
          <p className="text-sm text-blue-700 dark:text-blue-300">
            Secure payment processing for your legal practice
          </p>
        </div>
      </div>
    </div>
  );

  const renderBusinessDetailsStep = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          label="Address line 1"
          value={formData.addressLine1}
          onChange={(value) => setFormData(prev => ({ ...prev, addressLine1: value }))}
        />
        <Input
          label="Address line 2"
          value={formData.addressLine2}
          onChange={(value) => setFormData(prev => ({ ...prev, addressLine2: value }))}
        />
        <Input
          label="City"
          value={formData.city}
          onChange={(value) => setFormData(prev => ({ ...prev, city: value }))}
        />
        <Input
          label="State / Province"
          value={formData.state}
          onChange={(value) => setFormData(prev => ({ ...prev, state: value }))}
        />
        <Input
          label="Postal code"
          value={formData.postalCode}
          onChange={(value) => setFormData(prev => ({ ...prev, postalCode: value }))}
        />
        <Input
          label="Country"
          value={formData.country}
          onChange={(value) => setFormData(prev => ({ ...prev, country: value }))}
        />
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Primary color"
            value={formData.primaryColor}
            onChange={(value) => setFormData(prev => ({ ...prev, primaryColor: value }))}
            placeholder="#2563eb"
          />
          <Input
            label="Accent color"
            value={formData.accentColor}
            onChange={(value) => setFormData(prev => ({ ...prev, accentColor: value }))}
            placeholder="#3b82f6"
          />
        </div>
        <Textarea
          label="Welcome message"
          value={formData.introMessage}
          onChange={(value) => setFormData(prev => ({ ...prev, introMessage: value }))}
          rows={3}
        />
        <Textarea
          label="Business description"
          value={formData.overview}
          onChange={(value) => setFormData(prev => ({ ...prev, overview: value }))}
          rows={5}
        />
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
          Visibility
        </h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">
              Make workspace public
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              When enabled, anyone can chat with your assistant and submit intake questions.
            </p>
          </div>
          <Switch
            value={formData.isPublic}
            onChange={(value) => setFormData(prev => ({ ...prev, isPublic: value }))}
          />
        </div>
      </div>
    </div>
  );

  const renderReviewAndLaunchStep = () => {
    const intakeUrl = `https://ai.blawby.com/${organizationName?.toLowerCase().replace(/\s+/g, '-') || 'your-firm'}`;
    
    return (
      <div className="space-y-6">
        <div className="rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.05] p-6 space-y-4">
          <div className="space-y-3 text-sm">
            <div className="flex justify-between py-2 border-b border-gray-100 dark:border-white/10">
              <span className="text-gray-500 dark:text-gray-400">Firm name</span>
              <span className="font-medium text-gray-900 dark:text-white">{formData.firmName || '—'}</span>
            </div>
            
            <div className="flex justify-between py-2 border-b border-gray-100 dark:border-white/10">
              <span className="text-gray-500 dark:text-gray-400">Email</span>
              <span className="font-medium text-gray-900 dark:text-white">{formData.contactEmail || '—'}</span>
            </div>
            
            <div className="flex justify-between py-2 border-b border-gray-100 dark:border-white/10">
              <span className="text-gray-500 dark:text-gray-400">Phone</span>
              <span className="font-medium text-gray-900 dark:text-white">{formData.contactPhone || '—'}</span>
            </div>
            
            <div className="flex justify-between py-2 border-b border-gray-100 dark:border-white/10">
              <span className="text-gray-500 dark:text-gray-400">Visibility</span>
              <span className="font-medium text-gray-900 dark:text-white">
                {formData.isPublic ? 'Public' : 'Private'}
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20 p-6 space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
              <span className="text-white text-lg">🔗</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-1">
                Your intake page URL
              </p>
              <p className="font-mono text-sm text-blue-700 dark:text-blue-300 break-all">
                {intakeUrl}
              </p>
            </div>
          </div>
          
          <p className="text-xs text-blue-700 dark:text-blue-300">
            After launching, share this link on your website, in emails, or on social media to start collecting client intake.
          </p>
        </div>

        <div className="rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.05] p-5">
          <h4 className="font-medium text-sm text-gray-900 dark:text-white mb-3">
            What happens when you launch
          </h4>
          <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
            <li className="flex items-start gap-2">
              <span className="text-accent-500 mt-0.5">•</span>
              <span>Your AI assistant will be available at your intake page URL</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-accent-500 mt-0.5">•</span>
              <span>Clients can chat with your assistant and submit intake forms</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-accent-500 mt-0.5">•</span>
              <span>You’ll receive notifications for new client submissions</span>
            </li>
          </ul>
        </div>
      </div>
    );
  };

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 'welcome':
        return renderWelcomeStep();
      case 'firm-basics':
        return renderFirmBasicsStep();
      case 'trust-account-intro':
        return renderTrustAccountIntroStep();
      case 'stripe-onboarding':
        return renderStripeOnboardingStep();
      case 'business-details':
        return renderBusinessDetailsStep();
      case 'review-and-launch':
        return renderReviewAndLaunchStep();
      default:
        return null;
    }
  };

  const handleClose = () => {
    try {
      localStorage.setItem('businessSetupPending', 'snoozed');
    } catch {
      // noop
    }
    onClose();
  };

  if (!isOpen) {
    return null;
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} type="fullscreen" showCloseButton={false}>
      <div className="min-h-screen bg-light-bg dark:bg-dark-bg py-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-2xl">
          <div className="flex justify-center mb-6">
            <Logo size="lg" />
          </div>
          
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900 dark:text-white">
            {STEP_TITLES[currentStep]}
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
            {STEP_DESCRIPTIONS[currentStep]}
          </p>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-2xl">
          <div className="bg-white dark:bg-dark-card-bg py-8 px-4 shadow sm:rounded-lg sm:px-10">
            {error && (
              <div className="mb-6 rounded-md border border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-900/20 p-4 text-sm text-red-700 dark:text-red-300">
                {error}
              </div>
            )}

            {loading ? (
              <div className="flex items-center justify-center py-10">
                <div className="w-8 h-8 border-2 border-accent-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              renderCurrentStep()
            )}

            <div className="mt-6 space-y-3">
              <Button
                variant="primary"
                size="lg"
                className="w-full"
                onClick={handleStepContinue}
                disabled={loading}
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : currentStep === 'review-and-launch' ? (
                  'Launch Assistant'
                ) : (
                  'Continue'
                )}
              </Button>
              
              <Button
                variant="secondary"
                size="lg"
                className="w-full"
                onClick={handleBack}
              >
                {currentStepIndex === 0 ? 'Cancel' : 'Back'}
              </Button>
            </div>
            
            <div className="text-center text-xs text-gray-500 dark:text-gray-400 mt-4">
              Progress is saved automatically.
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default BusinessOnboardingModal;