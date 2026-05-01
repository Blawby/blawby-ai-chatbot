import { useState, useRef } from 'preact/hooks';
import { createUserDetail } from '@/shared/lib/apiClient';

export function useCreateContact(practiceId: string | null) {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submittingRef = useRef(false);
  const submit = async () => {
    if (submittingRef.current) return;
    if (!practiceId) throw new Error('Practice ID is required');
    if (!email.trim()) throw new Error('Email is required');

    submittingRef.current = true;
    setSubmitting(true);
    try {
      await createUserDetail(practiceId, { email: email.trim() });
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const reset = () => {
    setEmail('');
    setSubmitting(false);
  };

  return {
    form: { email },
    updateField: (field: string, value: string) => {
      if (field === 'email') setEmail(value);
    },
    submitting,
    submit,
    reset,
  };
}
