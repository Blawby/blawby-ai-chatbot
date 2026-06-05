import { useState, useCallback } from 'preact/hooks';
import type { JSX } from 'preact';
import { Mic, ArrowUp } from 'lucide-preact';
import { Icon } from '@/shared/ui/Icon';
import { cn } from '@/shared/utils/cn';
import { Composer } from './Composer';

export interface AIAskBarContextChip {
  id: string;
  label: string;
  onRemove?: () => void;
}

export interface AIAskBarProps {
  placeholder?: string;
  contextChips?: readonly AIAskBarContextChip[];
  suggestions?: readonly string[];
  onSubmit: (query: string, contextIds: string[]) => void;
  onVoice?: () => void;
  onAddContext?: () => void;
  sticky?: boolean;
  /** Pass a string to override, null to hide entirely, undefined for default kbd hint. */
  disclaimer?: string | null;
  className?: string;
}

const DEFAULT_DISCLAIMER = (
  <span>
    <kbd>Enter</kbd> send · <kbd>Shift</kbd> <kbd>Enter</kbd> newline · Blawby never writes to your records without your approval.
  </span>
);

export function AIAskBar({
  placeholder,
  contextChips,
  suggestions,
  onSubmit,
  onVoice,
  onAddContext,
  sticky = true,
  disclaimer = undefined,
  className,
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

  const card = (
    <form
      className={cn('ai-ask-bar', className)}
      onSubmit={handleSubmit}
      role="search"
      aria-label="Ask the assistant"
    >
      <Composer
        placeholder={placeholder}
        value={value}
        inputMode="single-line"
        onInput={(event) => setValue((event.currentTarget as HTMLTextAreaElement).value)}
        onKeyDown={handleKeyDown}
        inputAriaLabel="Ask the assistant"
        beforeInput={suggestions && suggestions.length > 0 ? (
          <div className="composer-suggestions">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                className="composer-suggestion"
                onClick={() => submit(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>
        ) : null}
        contextChips={contextChips}
        actions={
          <>
            {onAddContext && (
              <button type="button" className="composer-ctx-add" onClick={onAddContext}>
                + add context
              </button>
            )}
            <div className="composer-spacer" />
            {onVoice && (
              <button
                type="button"
                className="composer-icon-button"
                onClick={onVoice}
                aria-label="Voice input"
              >
                <Icon icon={Mic} className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              type="submit"
              className="composer-send-button"
              aria-label="Send"
              disabled={!value.trim()}
            >
              <Icon icon={ArrowUp} className="h-4 w-4" />
            </button>
          </>
        }
        hint={disclaimer !== null ? (disclaimer ?? DEFAULT_DISCLAIMER) : null}
      />
    </form>
  );

  return sticky ? <div className="ai-ask-bar-wrap">{card}</div> : card;
}
