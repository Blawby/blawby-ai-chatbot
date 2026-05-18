import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import type { DerivedIntakeStatus, IntakeConversationState } from '@/shared/types/intake';
import type { ContactData } from '@/features/intake/components/ContactForm';

export interface IntakeContextValue {
  intakeStatus: DerivedIntakeStatus | null;
  intakeConversationState: IntakeConversationState | null;
  onIntakeCtaResponse: ((response: 'ready' | 'not_yet') => Promise<void>) | undefined;
  onSubmitNow: (() => void | Promise<void>) | undefined;
  onBuildBrief: (() => void) | undefined;
  onStrengthenCase: (() => void) | undefined;
  slimContactDraft: { name: string; email: string; phone: string } | null;
  onSlimFormContinue: ((data: ContactData) => void | Promise<void>) | undefined;
  onSlimFormDismiss: (() => void | Promise<void>) | undefined;
  isPublicWorkspace: boolean;
}

const defaultIntakeContextValue: IntakeContextValue = {
  intakeStatus: null,
  intakeConversationState: null,
  onIntakeCtaResponse: undefined,
  onSubmitNow: undefined,
  onBuildBrief: undefined,
  onStrengthenCase: undefined,
  slimContactDraft: null,
  onSlimFormContinue: undefined,
  onSlimFormDismiss: undefined,
  isPublicWorkspace: false,
};

export const IntakeContext = createContext<IntakeContextValue>(defaultIntakeContextValue);

export function IntakeProvider({
  value,
  children,
}: {
  value: IntakeContextValue;
  children: ComponentChildren;
}) {
  return (
    <IntakeContext.Provider value={value}>
      {children}
    </IntakeContext.Provider>
  );
}

export function useIntakeContext() {
  return useContext(IntakeContext);
}
