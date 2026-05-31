import { useState, useCallback } from 'preact/hooks';
import type { JSX } from 'preact';
import { Mic, ArrowUp } from 'lucide-preact';
import { Icon } from '@/shared/ui/Icon';
import { cn } from '@/shared/utils/cn';

export interface AIAskBarContextChip {
  id: string;
  label: string;
}

export interface AIAskBarProps {
  /** Placeholder text — e.g. "Find clients who haven't been heard from in 30 days...". */
  placeholder?: string;
  /** Context chips above the input — e.g. "All matters", "Last 30 days". */
  contextChips?: readonly AIAskBarContextChip[];
  /**
   * 1–3 pill-shaped suggestions shown above the context chips.
   * Clicking a suggestion submits it directly.
   */
  suggestions?: readonly string[];
  /** Fired when the user submits the query (Enter, send button, or suggestion). */
  onSubmit: (query: string, contextIds: string[]) => void;
  /** Fired when the voice mic button is clicked. */
  onVoice?: () => void;
  /** When true, sticks to the bottom of the container. Default: true. */
  sticky?: boolean;
  /** Trust line beneath the input. */
  disclaimer?: string;
  className?: string;
}

/**
 * AIAskBar (DESIGN_SYSTEM §3.7 chat-first variant).
 *
 * Sticky bottom composer for "ask the assistant a one-off question on a list
 * view". Used on Home / Matters / Clients / Calendar / Tasks. Distinct from
 * the chat `Composer` — this is a pill-shaped one-off ask, not a multi-turn
 * threaded surface.
 *
 * Layout from top to bottom:
 *   suggestions  (small pills)
 *   context chips (mono dashed pills)
 *   pill input row (mic · input · send)
 *   disclaimer    (mono dim)
 */
export function AIAskBar({
  placeholder,
  contextChips,
  suggestions,
  onSubmit,
  onVoice,
  sticky = true,
  disclaimer = 'Blawby never writes without your approval',
  className
}: AIAskBarProps) {
  const [value, setValue] = useState('');

  const submit = useCallback(
    (query: string) => {
      const trimmed = query.trim();
      if (!trimmed) return;
      const contextIds = contextChips?.map((chip) => chip.id) ?? [];
      onSubmit(trimmed, contextIds);
      setValue('');
    },
    [contextChips, onSubmit]
  );

  const handleSubmit: JSX.GenericEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    submit(value);
  };

  const handleKeyDown: JSX.KeyboardEventHandler<HTMLInputElement> = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit(value);
    }
  };

  const card = (
    <form
      className={cn('ai-ask-bar', className)}
      onSubmit={handleSubmit}
      role="search"
      aria-label="Ask the assistant"
    >
      {suggestions && suggestions.length > 0 && (
        <div className="ai-ask-bar-suggestions">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              className="ai-ask-bar-suggestion"
              onClick={() => submit(suggestion)}
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}

      {contextChips && contextChips.length > 0 && (
        <div className="ai-ask-bar-context">
          {contextChips.map((chip) => (
            <span key={chip.id} className="ai-ask-bar-ctx">
              {chip.label}
            </span>
          ))}
        </div>
      )}

      <div className="ai-ask-bar-row">
        {onVoice && (
          <button
            type="button"
            className="ai-ask-bar-icon"
            onClick={onVoice}
            aria-label="Voice input"
          >
            <Icon icon={Mic} className="h-4 w-4" />
          </button>
        )}
        <input
          type="text"
          className="ai-ask-bar-input"
          placeholder={placeholder}
          value={value}
          onInput={(event) => setValue((event.target as HTMLInputElement).value)}
          onKeyDown={handleKeyDown}
          aria-label="Ask the assistant"
        />
        <button
          type="submit"
          className="ai-ask-bar-send"
          aria-label="Send"
          disabled={!value.trim()}
        >
          <Icon icon={ArrowUp} className="h-4 w-4" />
        </button>
      </div>

      {disclaimer && <div className="ai-ask-bar-disclaimer">{disclaimer}</div>}
    </form>
  );

  return sticky ? <div className="ai-ask-bar-wrap">{card}</div> : card;
}
