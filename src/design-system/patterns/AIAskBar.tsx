import { useState, useCallback, useRef } from 'preact/hooks';
import type { JSX } from 'preact';
import { Mic, ArrowUp } from 'lucide-preact';
import { Icon } from '@/shared/ui/Icon';
import { cn } from '@/shared/utils/cn';

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
    <kbd>⌘</kbd> <kbd>↵</kbd> send · <kbd>⌘</kbd> <kbd>K</kbd> search · <kbd>⌘</kbd> <kbd>/</kbd> commands · Blawby never writes to your records without your approval.
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
  const inputRef = useRef<HTMLInputElement>(null);

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

      {/* Full-width input */}
      <input
        ref={inputRef}
        type="text"
        className="ai-ask-bar-input"
        placeholder={placeholder}
        value={value}
        onInput={(event) => setValue((event.target as HTMLInputElement).value)}
        onKeyDown={handleKeyDown}
        aria-label="Ask the assistant"
      />

      {/* Bottom action row */}
      <div className="ai-ask-bar-row">
        {contextChips && contextChips.map((chip) => (
          <span key={chip.id} className="ai-ask-bar-ctx">
            {chip.label}
            {chip.onRemove && (
              <button
                type="button"
                onClick={chip.onRemove}
                aria-label={`Remove ${chip.label}`}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'inherit', lineHeight: 1 }}
              >
                ×
              </button>
            )}
          </span>
        ))}
        {onAddContext && (
          <button type="button" className="ai-ask-bar-ctx-add" onClick={onAddContext}>
            ＋ add context
          </button>
        )}
        <div className="ai-ask-bar-spacer" />
        {onVoice && (
          <button
            type="button"
            className="ai-ask-bar-icon"
            onClick={onVoice}
            aria-label="Voice input"
          >
            <Icon icon={Mic} className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="submit"
          className="ai-ask-bar-send"
          aria-label="Send"
          disabled={!value.trim()}
        >
          <Icon icon={ArrowUp} className="h-4 w-4" />
        </button>
      </div>

      {disclaimer !== null && (
        <div className="ai-ask-bar-disclaimer">
          {disclaimer ?? DEFAULT_DISCLAIMER}
        </div>
      )}
    </form>
  );

  return sticky ? <div className="ai-ask-bar-wrap">{card}</div> : card;
}
