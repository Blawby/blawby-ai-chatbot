import type { JSX } from 'preact';
import { useCallback, useEffect, useRef } from 'preact/hooks';
import { PaperAirplaneIcon } from '@heroicons/react/24/outline';
import { DetailHeader } from '@/shared/ui/layout/DetailHeader';
import { Avatar } from '@/shared/ui/profile';
import { cn } from '@/shared/utils/cn';

type BuilderWidgetShellProps = {
  practiceName?: string | null;
  practiceLogo?: string | null;
  children?: JSX.Element | JSX.Element[] | null;
  docked?: JSX.Element | null;
};

export function BuilderWidgetShell({
  practiceName,
  practiceLogo: _practiceLogo,
  children,
  docked,
}: BuilderWidgetShellProps) {
  return (
    <div className="mx-auto w-full max-w-[390px]">
      <div className="overflow-hidden rounded-[28px] border border-line-glass/40 bg-surface-card shadow-glass">
        <div className="relative h-[720px] w-full overflow-hidden widget-shell-gradient">
          <DetailHeader
            title={practiceName?.trim() || 'Blawby Messenger'}
            className="workspace-conversation-header"
          />
          <div className="flex h-[calc(100%-73px)] flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto">
              {children}
            </div>
            {docked ? <div className="shrink-0">{docked}</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export function BuilderWidgetComposerShell() {
  return (
    <div className="px-4 pb-4 pt-2">
      <div className="message-composer-container">
        <div className="message-composer-input-row">
          <div className="col-start-2 relative flex flex-1 items-end gap-2 rounded-full px-3 py-2.5 glass-input">
            <div className="relative flex min-w-0 flex-1 self-stretch items-center">
              <textarea
                rows={1}
                value=""
                placeholder="Enter your message"
                disabled
                readOnly
                className="m-0 min-h-8 w-full resize-none overflow-hidden border-none bg-transparent py-2 text-sm leading-5 text-input-placeholder outline-none box-border disabled:opacity-100 sm:text-base"
              />
            </div>
            <button
              type="button"
              disabled
              aria-label="Send"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-utility/70 text-input-placeholder"
            >
              <PaperAirplaneIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

type BuilderAssistantPreviewMessageProps = {
  practiceName?: string | null;
  practiceLogo?: string | null;
  value: string;
  readOnly?: boolean;
  placeholder: string;
  onChange: (next: string) => void;
  onBlur?: () => void;
  bubbleClassName?: string;
};

export function BuilderAssistantPreviewMessage({
  practiceName,
  practiceLogo,
  value,
  readOnly = false,
  placeholder,
  onChange,
  onBlur,
  bubbleClassName = '',
}: BuilderAssistantPreviewMessageProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const resizeTextarea = useCallback(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${element.scrollHeight}px`;
  }, []);

  useEffect(() => {
    resizeTextarea();
  }, [resizeTextarea, value]);

  return (
    <div className="px-4 py-4">
      <div className="flex items-start gap-3">
        <Avatar
          src={practiceLogo ?? null}
          name={practiceName?.trim() || 'Assistant'}
          size="lg"
          className="shrink-0"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-semibold text-input-text">{practiceName?.trim() || 'Assistant'}</span>
            <span className="text-xs text-input-placeholder">just now</span>
          </div>
          <div className={cn('mt-1 rounded-2xl', bubbleClassName)}>
            <textarea
              ref={textareaRef}
              value={value}
              onInput={(event) => {
                const element = event.currentTarget as HTMLTextAreaElement;
                onChange(element.value);
                element.style.height = 'auto';
                element.style.height = `${element.scrollHeight}px`;
              }}
              onFocus={resizeTextarea}
              onBlur={onBlur}
              readOnly={readOnly}
              rows={1}
              placeholder={placeholder}
              className="block min-h-[20px] w-full resize-none overflow-hidden border-0 bg-transparent p-0 text-sm leading-5 text-input-text outline-none placeholder:text-input-placeholder"
              style={{ height: 'auto' }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
