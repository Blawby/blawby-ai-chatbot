import { useEffect, useRef, useState } from 'preact/hooks';
import { Building2 } from 'lucide-preact';
import { Button } from '@/shared/ui/Button';
import { Logo } from '@/shared/ui/Logo';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage, type FormData } from '@/shared/ui/form';
import { Input } from '@/shared/ui/input';
import { LoadingSpinner } from '@/shared/ui/layout/LoadingSpinner';
import { z } from 'zod';
import { authClient, getSession } from '@/shared/lib/authClient';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { slugify, unwrapCreated, type CreatedOrg } from '@/shared/lib/orgCreation';

interface PracticeNameData extends FormData {
  practiceName: string;
}

const practiceNameSchema = z.object({
  practiceName: z
    .string()
    .min(2, 'Practice name must be at least 2 characters')
    .max(120, 'Practice name is too long'),
});

interface PracticeNameStepProps {
  /** Default value (e.g. derived from the user's full name). */
  defaultName?: string;
  /** Fired after the org is created and activated. Receives the created org. */
  onComplete: (org: CreatedOrg) => Promise<void> | void;
  isSubmitting?: boolean;
}

const PracticeNameStep = ({
  defaultName = '',
  onComplete,
  isSubmitting: parentSubmitting = false,
}: PracticeNameStepProps) => {
  const { showError } = useToastContext();
  const [localSubmitting, setLocalSubmitting] = useState(false);
  const mountedRef = useRef(true);
  const submittingRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const handleSubmit = async (formData: PracticeNameData) => {
    if (parentSubmitting || submittingRef.current) return;
    submittingRef.current = true;
    setLocalSubmitting(true);
    try {
      const name = formData.practiceName.trim();
      if (!name) {
        showError('Practice name is required', 'Enter a practice name to continue.');
        return;
      }
      const proposedSlug = slugify(name);
      const created = unwrapCreated(
        await authClient.organization.create({
          name,
          ...(proposedSlug ? { slug: proposedSlug } : {}),
        })
      );
      if (!created?.id) {
        throw new Error('Practice was not created');
      }
      await authClient.organization.setActive({ organizationId: created.id });
      await getSession().catch(() => undefined);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('auth:session-updated'));
      }
      await onComplete(created);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Please try again.';
      showError('Could not create practice', message);
    } finally {
      submittingRef.current = false;
      if (mountedRef.current) {
        setLocalSubmitting(false);
      }
    }
  };

  const submitting = parentSubmitting || localSubmitting;

  return (
    <div className="min-h-screen bg-transparent flex flex-col justify-center px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-md">
        <div className="flex justify-center mb-6">
          <Logo size="lg" />
        </div>

        <h2 className="mt-6 text-center text-2xl font-semibold tracking-tight text-input-text">
          Name your practice
        </h2>
        <p className="mt-2 text-center text-sm text-input-placeholder">
          This is the workspace your team and clients will see. You can fine-tune the details later.
        </p>
      </div>

      <div className="mt-8 mx-auto w-full max-w-md">
        <div className="card py-8 px-6 sm:px-10">
          <Form<PracticeNameData>
            onSubmit={async (formData: PracticeNameData): Promise<void> => {
              await handleSubmit(formData);
            }}
            initialData={{ practiceName: defaultName }}
            schema={practiceNameSchema}
          >
            <div className="space-y-4">
              <FormField name="practiceName">
                {({ value, error, onChange }) => (
                  <FormItem>
                    <FormLabel>Practice name</FormLabel>
                    <FormControl>
                      <Input
                        type="text"
                        required
                        value={(value as string) || ''}
                        onChange={(next) => onChange(next)}
                        placeholder="Acme Law"
                        icon={Building2}
                        iconClassName="h-5 w-5 text-input-placeholder"
                        error={error?.message}
                      />
                    </FormControl>
                    {error && <FormMessage>{error.message}</FormMessage>}
                  </FormItem>
                )}
              </FormField>
            </div>

            <div className="mt-6 space-y-3">
              <Button
                type="submit"
                disabled={submitting}
                variant="primary"
                size="lg"
                className="w-full"
              >
                {submitting ? (
                  <LoadingSpinner size="md" ariaLabel="Creating practice" />
                ) : (
                  'Create practice'
                )}
              </Button>
            </div>
          </Form>
        </div>
      </div>
    </div>
  );
};

export default PracticeNameStep;
