import { Sparkles } from 'lucide-preact';

import { Button } from '@/shared/ui/Button';

export function IntakeAuthoringStrip() {
  return (
    <section className="mb-6 flex flex-col gap-3 rounded-md border border-line-subtle bg-paper-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
        <div>
          <h3 className="text-sm font-medium text-ink">AI template authoring is not connected</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-dim-2">
            Continue editing questions manually. Blawby will not fabricate suggestions, staged changes, or conversion evidence.
          </p>
        </div>
      </div>
      <Button variant="secondary" size="sm" disabled title="Requires the backend AI authoring contract">
        Suggestions unavailable
      </Button>
    </section>
  );
}
