import { FunctionComponent } from 'preact';
import { lazy, Suspense } from 'preact/compat';
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { StripeElementsOptionsClientSecret } from '@stripe/stripe-js';
import { useTranslation } from '@/shared/i18n/hooks';
import { ChatDockedAction } from './ChatDockedAction';
import AuthForm from '@/shared/components/AuthForm';
import { ContactForm, type ContactData } from '@/features/intake/components/ContactForm';
import { Button } from '@/shared/ui/Button';
import { LoadingSpinner } from '@/shared/ui/layout/LoadingSpinner';
import type { IntakePaymentRequest } from '@/shared/utils/intakePayments';

const LazyPaymentPanel = lazy(() => import('./PaymentPanel'));

interface ChatActionCardProps {
  type: 'auth' | 'payment' | 'slim-form' | 'disclaimer' | null;
  isOpen: boolean;
  onClose: () => void;
  // Auth props
  authProps?: {
    practiceName?: string | null;
    initialEmail?: string;
    initialName?: string;
    callbackURL?: string;
    onSuccess?: () => void;
  };
  // Payment props
  paymentProps?: {
    request: IntakePaymentRequest | null;
    onSuccess?: () => void;
  };
  // Slim form props
  slimFormProps?: {
    onContinue: (data: ContactData) => void | Promise<void>;
    initialValues?: ContactData | null;
  };
  disclaimerProps?: {
    text: string;
    onAccept: () => void | Promise<void>;
    isSubmitting?: boolean;
    subtitle?: string;
  };
}

export const ChatActionCard: FunctionComponent<ChatActionCardProps> = ({
  type,
  isOpen,
  onClose,
  authProps,
  paymentProps,
  slimFormProps,
  disclaimerProps
}) => {
  const { t } = useTranslation(['common', 'auth']);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signup');
  const [isDarkTheme, setIsDarkTheme] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const updateTheme = () => {
      const hasDarkClass = document.documentElement.classList.contains('dark');
      setIsDarkTheme(hasDarkClass || mediaQuery.matches);
    };
    updateTheme();
    mediaQuery.addEventListener('change', updateTheme);
    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => {
      mediaQuery.removeEventListener('change', updateTheme);
      observer.disconnect();
    };
  }, []);

  // Payment elements options
  const clientSecret = paymentProps?.request?.clientSecret;
  const elementsOptions = useMemo<StripeElementsOptionsClientSecret | null>(() => {
    if (!clientSecret) return null;
    return {
      clientSecret,
      appearance: {
        theme: isDarkTheme ? 'night' : 'stripe',
        variables: {
          colorPrimary: '#3b82f6',
          colorText: isDarkTheme ? '#f8fafc' : '#0f172a',
          colorBackground: isDarkTheme ? '#0f172a' : '#ffffff',
          colorDanger: '#dc2626',
          fontFamily: 'ui-sans-serif, system-ui',
          borderRadius: '12px'
        }
      }
    };
  }, [clientSecret, isDarkTheme]);

  if (!type || !isOpen) return null;

  if (type === 'disclaimer' && disclaimerProps) {
    return (
      <ChatDockedAction
        isOpen={isOpen}
        onClose={onClose}
        title={t('chat.card.disclaimer.title')}
        description={disclaimerProps.subtitle || t('chat.card.disclaimer.description')}
      >
        <div className="max-h-[45vh] overflow-y-auto whitespace-pre-wrap text-sm leading-6 text-input-text">
          {disclaimerProps.text}
        </div>
        <Button
          type="button"
          onClick={disclaimerProps.onAccept}
          disabled={disclaimerProps.isSubmitting}
          className="mt-5 w-full"
        >
          {disclaimerProps.isSubmitting ? t('chat.card.disclaimer.starting') : t('chat.card.disclaimer.acceptButton')}
        </Button>
      </ChatDockedAction>
    );
  }

  if (type === 'payment' && paymentProps?.request) {
    const canUseElements = Boolean(clientSecret && elementsOptions && import.meta.env.VITE_STRIPE_KEY);
    return (
      <ChatDockedAction
        isOpen={isOpen}
        onClose={onClose}
        title={t('common:payment.title', 'Complete Payment')}
        description={t('common:payment.subtitle', 'Securely finalize your intake request')}
      >
        {canUseElements ? (
          <Suspense fallback={<div className="flex justify-center py-4"><LoadingSpinner size="sm" ariaLabel="Loading payment form" /></div>}>
            <LazyPaymentPanel
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              elementsOptions={elementsOptions!}
              amount={paymentProps.request.amount}
              currency={paymentProps.request.currency}
              intakeUuid={paymentProps.request.intakeUuid}
              conversationId={paymentProps.request.conversationId}
              onSuccess={paymentProps.onSuccess}
            />
          </Suspense>
        ) : (
          <div className="p-4 text-center text-sm text-input-text">
            {t('common:chat.paymentDetailsMissing', 'Payment details missing or unavailable.')}
          </div>
        )}
      </ChatDockedAction>
    );
  }

  if (type === 'auth' && authProps) {
    return (
      <ChatDockedAction
        isOpen={isOpen}
        onClose={onClose}
        title={authMode === 'signup' ? t('auth:authPrompt.title', 'Sign up') : t('auth:signin.title', 'Sign in')}
        description={authMode === 'signup' ? t('auth:authPrompt.subtitle', 'Create an account to get started') : t('auth:signin.subtitle', 'Welcome back — please sign in')}
      >
        <AuthForm
          mode={authMode}
          defaultMode="signup"
          onModeChange={setAuthMode}
          initialEmail={authProps.initialEmail}
          initialName={authProps.initialName}
          callbackURL={authProps.callbackURL}
          onSuccess={async () => {
            try {
              if (authProps.onSuccess) await authProps.onSuccess();
            } catch (error) {
              console.error('[ChatActionCard] auth success handler failed:', error);
            } finally {
              onClose();
            }
          }}
          showHeader={false}
          variant="plain"
        />
      </ChatDockedAction>
    );
  }

  if (type === 'slim-form' && slimFormProps) {
    return (
      <ChatDockedAction
        isOpen={isOpen}
        onClose={onClose}
        title={t('common:chat.requestConsultation')}
        description={t('common:chat.provideContactDetails')}
      >
        <ContactForm
          onSubmit={slimFormProps.onContinue}
          fields={['name', 'email', 'phone']}
          required={['name', 'email', 'phone']}
          initialValues={slimFormProps.initialValues ?? undefined}
          variant="plain"
          showSubmitButton={true}
          submitFullWidth={true}
          submitLabel={t('common:chat.continue')}
        />
      </ChatDockedAction>
    );
  }

  return null;
};
