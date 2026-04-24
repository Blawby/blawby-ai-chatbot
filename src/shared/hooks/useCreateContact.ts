import { useCallback, useState } from 'preact/hooks';
import { createUserDetail } from '@/shared/lib/apiClient';

export type CreateContactFormState = {
  email: string;
};

export const buildDefaultCreateContactFormState = (): CreateContactFormState => ({
  email: '',
});

type UseCreateContactResult = {
  form: CreateContactFormState;
  updateField: <K extends keyof CreateContactFormState>(field: K, value: CreateContactFormState[K]) => void;
  submitting: boolean;
  reset: () => void;
  submit: () => Promise<void>;
};

export const useCreateContact = (practiceId: string | null): UseCreateContactResult => {
  const [form, setForm] = useState<CreateContactFormState>(buildDefaultCreateContactFormState);
  const [submitting, setSubmitting] = useState(false);

  const reset = useCallback(() => {
    setForm(buildDefaultCreateContactFormState());
  }, []);

  const updateField = useCallback(<K extends keyof CreateContactFormState>(
    field: K,
    value: CreateContactFormState[K]
  ) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  const submit = useCallback(async () => {
    if (!practiceId) {
      throw new Error('Practice context is required.');
    }

    const email = form.email.trim();
    if (!email) {
      throw new Error('Email is required');
    }

    if (submitting) {
      throw new Error('Invite already in progress');
    }

    setSubmitting(true);
    try {
      await createUserDetail(practiceId, {
        email,
        event_name: 'Invite Contact',
      });
      reset();
    } finally {
      setSubmitting(false);
    }
  }, [form.email, practiceId, reset, submitting]);

  return {
    form,
    updateField,
    submitting,
    reset,
    submit,
  };
};
