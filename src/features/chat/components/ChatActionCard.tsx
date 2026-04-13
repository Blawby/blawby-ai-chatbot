import { FunctionComponent } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { Elements } from '@stripe/react-stripe-js';
import type { StripeElementsOptionsClientSecret } from '@stripe/stripe-js';
import { useTranslation } from '@/shared/i18n/hooks';
import { ChatDockedAction } from './ChatDockedAction';
import AuthForm from '@/shared/components/AuthForm';
import { IntakePaymentForm } from '@/features/intake/components/IntakePaymentForm';
import { ContactForm, type ContactData } from '@/features/intake/components/ContactForm';
import type { IntakePaymentRequest } from '@/shared/utils/intakePayments';
import { stripePromise, hasStripeKey } from '@/features/intake/utils/stripe';

interface ChatActionCardProps {
 type: 'auth' | 'payment' | 'slim-form' | null;
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
}

export const ChatActionCard: FunctionComponent<ChatActionCardProps> = ({
 type,
 isOpen,
 onClose,
 authProps,
 paymentProps,
 slimFormProps
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

 if (type === 'payment' && paymentProps?.request) {
  const canUseElements = Boolean(clientSecret && elementsOptions && hasStripeKey && stripePromise);
  return (
   <ChatDockedAction
    isOpen={isOpen}
    onClose={onClose}
    title={t('common:payment.title', 'Complete Payment')}
    description={t('common:payment.subtitle', 'Securely finalize your intake request')}
   >
    {canUseElements ? (
     <Elements stripe={stripePromise} options={elementsOptions ?? undefined}>
      <IntakePaymentForm
       amount={paymentProps.request.amount}
       currency={paymentProps.request.currency}
       intakeUuid={paymentProps.request.intakeUuid}
       conversationId={paymentProps.request.conversationId}
       onSuccess={paymentProps.onSuccess}

       variant="plain"
      />
     </Elements>
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
