import type { ComponentChildren, JSX } from 'preact';
import { Fragment } from 'preact';
import { cn } from '@/shared/utils/cn';

export interface ComposerTab {
  id: string;
  label: string;
}

export interface ComposerContextChip {
  id: string;
  label: string;
  /** When provided, renders a remove-button. */
  onRemove?: () => void;
}

export interface ComposerProps {
  /** Optional tab strip — Reply / Internal note / Ask the assistant. */
  tabs?: readonly ComposerTab[];
  activeTabId?: string;
  onTabChange?: (id: string) => void;

  /** Context chips above the row — dashed mono pills. */
  contextChips?: readonly ComposerContextChip[];

  /** Placeholder shown when the input is empty. */
  placeholder?: string;
  /** Controlled input value. */
  value?: string;
  /** Single-line visual mode still uses a textarea so keyboard behavior stays consistent. */
  inputMode?: 'single-line' | 'multiline';
  onInput?: JSX.GenericEventHandler<HTMLTextAreaElement>;
  onKeyDown?: JSX.KeyboardEventHandler<HTMLTextAreaElement>;
  inputRef?: JSX.Ref<HTMLTextAreaElement>;
  inputAriaLabel?: string;
  inputDisabled?: boolean;
  inputProps?: JSX.HTMLAttributes<HTMLTextAreaElement>;
  inputSlot?: ComponentChildren;
  beforeInput?: ComponentChildren;
  afterInput?: ComponentChildren;

  /** Optional row of action buttons (voice, attach, send). */
  actions?: ComponentChildren;
  /** Mono hint line beneath the input — keyboard shortcuts + trust copy. */
  hint?: ComponentChildren;
  wrapClassName?: string;
  inputClassName?: string;
  rowClassName?: string;
  hintClassName?: string;

  /** When true, wraps in `.composer-wrap` for sticky bottom positioning. */
  sticky?: boolean;
  className?: string;
}

/**
 * Composer (DESIGN_SYSTEM §3.7).
 *
 * Sticky bottom input on chat surfaces. Composes optional tab strip,
 * context chips, multiline input, action row, and a mono hint line.
 *
 * The "trust line" ("Blawby never writes to your records without your
 * approval.") belongs in `hint` and should always appear when the composer
 * can trigger AI writes — per DESIGN_SYSTEM §3.2 IOLTA rule.
 */
export function Composer({
  tabs,
  activeTabId,
  onTabChange,
  contextChips,
  placeholder,
  value,
  inputMode = 'single-line',
  onInput,
  onKeyDown,
  inputRef,
  inputAriaLabel = 'Message',
  inputDisabled,
  inputProps,
  inputSlot,
  beforeInput,
  afterInput,
  actions,
  hint,
  wrapClassName,
  inputClassName,
  rowClassName,
  hintClassName,
  sticky = false,
  className
}: ComposerProps) {
  const inputPropsClassName = typeof inputProps?.className === 'string' ? inputProps.className : undefined;
  const { className: _ignoredInputPropsClassName, ...resolvedInputProps } = inputProps ?? {};
  const card = (
    <div className={cn('composer', className)}>
      {tabs && tabs.length > 0 && (
        <div className="composer-tabs" role="tablist">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                data-active={isActive}
                className="composer-tab"
                onClick={() => onTabChange?.(tab.id)}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      )}

      {beforeInput}

      {inputSlot ?? (
        <textarea
          ref={inputRef}
          className={cn(
            'composer-input',
            inputMode === 'single-line' ? 'composer-input--single-line' : 'composer-input--multiline',
            inputClassName,
            inputPropsClassName
          )}
          placeholder={placeholder}
          value={value}
          onInput={onInput}
          onKeyDown={onKeyDown}
          aria-label={inputAriaLabel}
          disabled={inputDisabled}
          rows={1}
          {...resolvedInputProps}
        />
      )}

      {afterInput}

      {(contextChips && contextChips.length > 0) || actions ? (
        <div className={cn('composer-row', rowClassName)}>
          {contextChips?.map((chip) => (
            <Fragment key={chip.id}>
              <span className="composer-ctx">
                <span>{chip.label}</span>
                {chip.onRemove && (
                  <button
                    type="button"
                    className="composer-ctx-remove"
                    onClick={chip.onRemove}
                    aria-label={`Remove ${chip.label}`}
                  >
                    ×
                  </button>
                )}
              </span>
            </Fragment>
          ))}
          {actions}
        </div>
      ) : null}

      {hint && <div className={cn('composer-hint', hintClassName)}>{hint}</div>}
    </div>
  );

  return sticky ? <div className={cn('composer-wrap', wrapClassName)}>{card}</div> : card;
}
