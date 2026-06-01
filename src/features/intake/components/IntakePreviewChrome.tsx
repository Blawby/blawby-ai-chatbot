/**
 * IntakePreviewChrome — fake browser-chrome shell rendered around the live
 * intake widget preview.
 *
 * Adds:
 *   - A mode toggle (Mobile / Desktop / Embed) that resizes the frame
 *     dimensions only — the preview content is identical regardless of mode.
 *   - A fake browser chrome header (traffic-light dots + URL) so the preview
 *     reads as "this is what your clients will see on a real domain", not
 *     "this is a panel inside the editor".
 *   - A foot row showing version + staged-change count + an external-tab
 *     handoff for the real public form.
 *
 * The wrapping shell delegates the actual rendering to the existing
 * `WidgetPreviewFrame`, which preserves the chat-first widget rendering
 * (avatar, conversation bubbles, payment card, composer) untouched.
 */

import { ExternalLink, Lock } from 'lucide-preact';
import type { ComponentChildren } from 'preact';

import { Seg } from '@/design-system/patterns';
import { cn } from '@/shared/utils/cn';

export type IntakePreviewMode = 'mobile' | 'desktop' | 'embed';

const PREVIEW_MODE_OPTIONS = [
  { value: 'mobile' as const, label: 'Mobile' },
  { value: 'desktop' as const, label: 'Desktop' },
  { value: 'embed' as const, label: 'Embed' },
];

// The wrappers below are width-only — the inner WidgetPreviewFrame still
// renders its own bordered card and conversation, but is constrained to the
// device width to demonstrate how the chat-first intake renders in each
// surface area. Heights stay flexible to the available viewport so the
// preview never clips under the editor scroll.
const PREVIEW_MODE_WIDTH: Record<IntakePreviewMode, string> = {
  mobile: 'max-w-[360px]',
  desktop: 'max-w-[640px]',
  embed: 'max-w-[400px]',
};

export interface IntakePreviewChromeProps {
  mode: IntakePreviewMode;
  onModeChange: (next: IntakePreviewMode) => void;
  /** Publicly visible URL shown in the fake chrome — `blawby.com/p/{slug}`. */
  publicFormUrl: string;
  /** Human-readable path shown in the fake address bar — typically host/path. */
  displayUrl: string;
  /** Version tag rendered in the foot row — `v.7 draft`, `Live v.5`, etc. */
  versionLabel: string;
  /** Mono dim staged-change count rendered to the right of the version. */
  stagedChangesLabel?: string;
  /** The preview content — the existing WidgetPreviewFrame. */
  children: ComponentChildren;
  /** Hide the preview-head row (used in mobile master-detail). */
  hideHead?: boolean;
  className?: string;
}

export function IntakePreviewChrome({
  mode,
  onModeChange,
  publicFormUrl,
  displayUrl,
  versionLabel,
  stagedChangesLabel,
  children,
  hideHead = false,
  className,
}: IntakePreviewChromeProps) {
  return (
    <div className={cn('flex w-full flex-col gap-3', className)}>
      {hideHead ? null : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-dim-2">
            <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Live preview · updates as you edit
          </span>
          <Seg<IntakePreviewMode>
            value={mode}
            options={PREVIEW_MODE_OPTIONS}
            onChange={onModeChange}
            ariaLabel="Preview viewport"
          />
        </div>
      )}

      <div
        className={cn(
          'mx-auto w-full overflow-hidden rounded-r-md border border-line-subtle bg-card shadow-glass',
          PREVIEW_MODE_WIDTH[mode],
        )}
      >
        <div className="flex items-center gap-2 border-b border-line-subtle bg-paper-2/50 px-3.5 py-2.5">
          <div className="flex shrink-0 items-center gap-1" aria-hidden="true">
            <span className="block h-2 w-2 rounded-full bg-dim-2/40" />
            <span className="block h-2 w-2 rounded-full bg-dim-2/40" />
            <span className="block h-2 w-2 rounded-full bg-dim-2/40" />
          </div>
          <div className="inline-flex min-w-0 flex-1 items-center gap-1.5 rounded-full border border-line-subtle bg-card px-2.5 py-1 font-mono text-[10.5px] text-dim-2">
            <Lock className="h-2.5 w-2.5 opacity-40" aria-hidden="true" />
            <span className="truncate">{displayUrl}</span>
          </div>
        </div>

        {/*
          Render the existing WidgetPreviewFrame untouched — it manages its
          own bordered chat card. The outer mode-toggle simply changes the
          available width here.
        */}
        <div className="bg-paper-2">{children}</div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 px-1 font-mono text-[10px] uppercase tracking-[0.08em] text-dim-2">
        <span>
          {versionLabel}
          {stagedChangesLabel ? <span className="ml-2">· {stagedChangesLabel}</span> : null}
        </span>
        <a
          href={publicFormUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 border-b border-dotted border-dim-2 pb-[1px] text-ink-2 transition-colors hover:text-ink"
        >
          Open in new tab
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </a>
      </div>
    </div>
  );
}
