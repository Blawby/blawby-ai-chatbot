import { useState, useRef, useEffect } from 'preact/hooks';
import { Button } from '@/shared/ui/Button';
import { getWidgetScriptUrl, getPublicFormOrigin } from '@/config/urls';
import { useToastContext } from '@/shared/contexts/ToastContext';
import type { JSX } from 'preact';
import { Dialog, DialogBody, DialogFooter } from '@/shared/ui/dialog';

export function getEmbedSnippet(practiceSlug: string, templateSlug: string): string {
  const esc = (s: string) => escapeHtmlAttribute(s);
  const src = getWidgetScriptUrl(encodeURIComponent(String(templateSlug)));
  return [
    '<script',
    `  src="${esc(src)}"`,
    `  data-practice="${esc(practiceSlug)}"`,
    '  async',
    '></script>',
  ].join('\n');
}

function escapeHtmlAttribute(input: string): string {
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function getPublicFormUrl(practiceSlug: string, templateSlug: string): string {
  const origin = typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : getPublicFormOrigin();
  const url = new URL(`/public/${encodeURIComponent(practiceSlug)}`, origin);
  url.searchParams.set('template', templateSlug);
  return url.toString();
}

export function copyTextToClipboard(
  text: string,
  onSuccess: () => void,
  onError: (message: string) => void,
) {
  if (
    typeof navigator !== 'undefined' &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === 'function'
  ) {
    navigator.clipboard.writeText(text)
      .then(onSuccess)
      .catch((error) => {
        onError(error instanceof Error ? error.message : 'Could not copy to clipboard.');
      });
    return;
  }

  if (typeof document === 'undefined') {
    onError('Clipboard is not available in this environment.');
    return;
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'absolute';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    try {
      textarea.select();
      const copied = document.execCommand('copy');
      if (copied) {
        onSuccess();
      } else {
        onError('Clipboard is not available.');
      }
    } catch (error) {
      throw error;
    } finally {
      if (document.body.contains(textarea)) {
        document.body.removeChild(textarea);
      }
    }
  } catch (error) {
    onError(error instanceof Error ? error.message : 'Clipboard is not available.');
  }
}

type EmbedCodeBlockProps = {
  practiceSlug: string;
  templateSlug: string;
};

export function EmbedCodeBlock({ practiceSlug, templateSlug }: EmbedCodeBlockProps) {
  const { showSuccess, showError } = useToastContext();
  const [copied, setCopied] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const snippet = getEmbedSnippet(practiceSlug, templateSlug);
  const publicUrl = getPublicFormUrl(practiceSlug, templateSlug);

  const handleOpenCopyDialog = () => {
    setIsDialogOpen(true);
  };

  useEffect(() => {
    if (isDialogOpen && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, [isDialogOpen]);

  const handleCopyLink = () => {
    copyTextToClipboard(
      publicUrl,
      () => {
        setCopiedLink(true);
        showSuccess('Link copied', 'The public intake link is ready to share.');
        setTimeout(() => setCopiedLink(false), 2000);
      },
      (message) => showError('Copy failed', message),
    );
  };

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="text-sm text-input-placeholder">
          Share the direct link or install the widget script on your site.
        </p>
        <div className="glass-panel rounded-xl px-4 py-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-widest text-input-placeholder">Public link</p>
              <a
                href={publicUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-1 block truncate text-sm font-medium text-input-text underline decoration-line-glass/50 underline-offset-4 hover:decoration-input-text"
              >
                {publicUrl}
              </a>
            </div>
            <Button type="button" variant="secondary" size="sm" onClick={handleCopyLink}>
              {copiedLink ? 'Copied' : 'Copy link'}
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-sm text-input-placeholder">
          Paste this script into your site&apos;s <code>&lt;head&gt;</code> or before <code>&lt;/body&gt;</code> to load this intake flow.
        </p>
        <div className="relative group">
          <pre className="bg-elevation-2 overflow-x-auto rounded-xl border border-line-glass/30 p-4 pr-20 text-sm font-mono text-input-text">
            {snippet}
          </pre>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleOpenCopyDialog}
            className="absolute right-3 top-3 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"
          >
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
      </div>
      <Dialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        title="Embed code"
        description="Copy or inspect the embed snippet for this intake template."
      >
        <DialogBody>
          <p className="mb-3 text-sm text-input-placeholder">Paste this script into your site&apos;s <code>&lt;head&gt;</code> or before <code>&lt;/body&gt;</code>.</p>
          <textarea
            ref={textareaRef}
            readOnly
            value={snippet}
            className="w-full resize-none rounded-md border border-line-glass/20 bg-surface-ground p-3 font-mono text-sm text-input-text"
            rows={6}
            aria-label="Embed snippet"
          />
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              copyTextToClipboard(
                snippet,
                () => {
                  setCopied(true);
                  showSuccess('Embed copied', 'The widget snippet is ready to paste.');
                  setTimeout(() => setCopied(false), 2000);
                  setIsDialogOpen(false);
                },
                (message) => showError('Copy failed', message),
              );
            }}
          >
            Copy embed
          </Button>
          <Button type="button" variant="ghost" onClick={() => setIsDialogOpen(false)}>Close</Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}

export default EmbedCodeBlock;
