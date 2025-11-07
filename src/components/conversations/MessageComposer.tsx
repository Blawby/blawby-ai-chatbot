import { FunctionComponent } from 'preact';
import { useState, useCallback } from 'preact/hooks';

interface MessageComposerProps {
  onSend: (content: string) => Promise<void> | void;
  placeholder?: string;
  disabled?: boolean;
}

export const MessageComposer: FunctionComponent<MessageComposerProps> = ({
  onSend,
  placeholder = 'Type a message…',
  disabled = false
}) => {
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);

  const handleSubmit = useCallback(async () => {
    const trimmed = value.trim();
    if (!trimmed || disabled || sending) {
      return;
    }
    try {
      setSending(true);
      await onSend(trimmed);
      setValue('');
    } finally {
      setSending(false);
    }
  }, [value, onSend, disabled, sending]);

  return (
    <div className="border-t border-border bg-background p-3">
      <div className="flex items-start space-x-2">
        <textarea
          className="flex-1 resize-none rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder={placeholder}
          rows={3}
          value={value}
          onInput={event => setValue((event.target as HTMLTextAreaElement).value)}
          disabled={disabled || sending}
        />
        <button
          type="button"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
          onClick={() => handleSubmit().catch(err => console.error('Failed to send message', err))}
          disabled={disabled || sending}
        >
          {sending ? 'Sending…' : 'Send'}
        </button>
      </div>
    </div>
  );
};
