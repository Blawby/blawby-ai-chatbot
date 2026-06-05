import { useCallback, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { ArrowUp } from 'lucide-preact';

import { Composer } from '@/design-system/patterns';
import { Icon } from '@/shared/ui/Icon';

export interface MatterAskCardProps {
  /** Optional one-line context line shown beneath the title. */
  contextLabel?: string;
  /** Placeholder for the input. */
  placeholder?: string;
  /**
   * Suggestion chips listed beneath the input. Clicking a chip submits
   * that string directly via onSubmit.
   */
  suggestions?: readonly string[];
  /** Fires when the user submits (Enter, send button, or suggestion). */
  onSubmit: (query: string) => void;
}

/**
 * MatterAskCard — pinned chat card scoped to a single matter
 * (per design_handoff_blawby_chat_first/screens/Matter.html ".ask-card").
 *
 * Dark-ink card rendered in the right rail of the matter detail. Distinct
 * from `AIAskBar`:
 *   - `AIAskBar` is the global one-off ask on list views (paper card, sticky
 *     bottom, suggestions as pills).
 *   - `MatterAskCard` is permanently scoped to one matter and lives in the
 *     right rail (ink card, suggestions as tappable underlined links).
 *
 * TODO(backend): wire onSubmit to `/api/practice/:id/matters/:matterId/ask`
 * once the scoped-context practice-assistant route exists. Today the stub
 * receives the query and the caller can navigate to /assistant or open a
 * focus drawer with the prefilled question.
 */
export const MatterAskCard = ({
  contextLabel = 'Pinned to this matter',
  placeholder = 'Ask anything about this matter...',
  suggestions = [],
  onSubmit
}: MatterAskCardProps) => {
  const [value, setValue] = useState('');

  const submit = useCallback(
    (query: string) => {
      const trimmed = query.trim();
      if (!trimmed) return;
      onSubmit(trimmed);
      setValue('');
    },
    [onSubmit]
  );

  const handleSubmit: JSX.GenericEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    submit(value);
  };

  const handleKeyDown: JSX.KeyboardEventHandler<HTMLTextAreaElement> = (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      submit(value);
      return;
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit(value);
    }
  };

  return (
    <section
      aria-label="Ask about this matter"
      className="rounded-md bg-[color:var(--ink)] p-4 text-[color:var(--paper)] shadow-[var(--shadow-2)]"
    >
      <div className="flex items-center gap-2.5">
        <div
          aria-hidden="true"
          className="flex h-7 w-7 items-center justify-center rounded-full bg-[color:var(--accent)] font-[family-name:var(--serif)] text-base italic text-[color:var(--accent-ink)]"
        >
          B
        </div>
        <div className="min-w-0 leading-tight">
          <div className="font-mono text-[9px] uppercase tracking-[0.1em] text-[color-mix(in_oklab,var(--paper)_50%,transparent)]">
            {contextLabel}
          </div>
          <h4 className="font-[family-name:var(--serif)] text-base font-normal text-[color:var(--paper)]">
            Ask about this matter
          </h4>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-3" role="search">
        <Composer
          className="composer--inverse"
          placeholder={placeholder}
          value={value}
          inputMode="single-line"
          onInput={(event) => setValue((event.currentTarget as HTMLTextAreaElement).value)}
          onKeyDown={handleKeyDown}
          inputAriaLabel="Ask the assistant about this matter"
          actions={(
            <>
              <div className="composer-spacer" />
              <button
                type="submit"
                disabled={!value.trim()}
                aria-label="Send"
                className="composer-send-button"
              >
                <Icon icon={ArrowUp} className="h-4 w-4" />
              </button>
            </>
          )}
        />

        {suggestions.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {suggestions.map((suggestion) => (
              <li key={suggestion}>
                <button
                  type="button"
                  onClick={() => submit(suggestion)}
                  className="flex w-full items-center gap-2 py-1 text-left font-[family-name:var(--sans)] text-[12.5px] text-[color:var(--accent)] transition-colors hover:text-[color-mix(in_oklab,var(--accent)_80%,white)]"
                >
                  <span aria-hidden="true" className="font-[family-name:var(--serif)] italic opacity-70">
                    ›
                  </span>
                  <span>{suggestion}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </form>
    </section>
  );
};
