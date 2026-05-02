import { useState, useEffect } from 'preact/hooks';
import { X } from 'lucide-preact';

import { Button } from '@/shared/ui/Button';
import { WorkspaceListHeader } from '@/shared/ui/layout/WorkspaceListHeader';
import type { ComponentChildren } from 'preact';
import type { WorkspacePlaceholderAction } from '@/shared/ui/layout/WorkspacePlaceholderState';
import type { LayoutMode } from '@/app/MainApp';

interface UseInvoiceBuilderTopBarOptions {
  view: string;
  workspace: 'public' | 'practice' | 'client';
  practiceSlug: string | null;
  navigate: (path: string) => void;
  layoutMode: LayoutMode;
  primaryCreateAction?: WorkspacePlaceholderAction | null;
}

export function useInvoiceBuilderTopBar({
  view,
  workspace,
  practiceSlug,
  navigate,
  layoutMode,
  primaryCreateAction,
}: UseInvoiceBuilderTopBarOptions): ComponentChildren | undefined {
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);

  useEffect(() => {
    const handler = (ev: Event) => {
      const ts = (ev as CustomEvent)?.detail?.timestamp;
      if (!ts) return;
      try {
        const d = new Date(ts);
        if (!isNaN(d.getTime())) setDraftSavedAt(d.toLocaleString());
      } catch {
        // ignore malformed events
      }
    };
    window.addEventListener('invoice:draft-saved', handler as EventListener);
    return () => window.removeEventListener('invoice:draft-saved', handler as EventListener);
  }, []);

  if (view !== 'invoiceCreate' && view !== 'invoiceEdit') return undefined;

  const isEdit = view === 'invoiceEdit';
  const handleClose = () => {
    if (workspace === 'practice' && practiceSlug) {
      navigate(`/practice/${encodeURIComponent(practiceSlug)}/invoices`);
    } else if (workspace === 'client' && practiceSlug) {
      navigate(`/client/${encodeURIComponent(practiceSlug)}/invoices`);
    } else {
      navigate('/dashboard');
    }
  };

  return (
    <WorkspaceListHeader
      leftControls={(
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="icon"
            size="icon-sm"
            aria-label={isEdit ? 'Close invoice editor' : 'Close invoice composer'}
            onClick={handleClose}
            icon={X}
            iconClassName="h-5 w-5"
          />
          <div className="h-5 w-px bg-line-glass/30" aria-hidden="true" />
        </div>
      )}
      title={<h1 className="workspace-header__title">{isEdit ? 'Edit Invoice' : 'Create Invoice'}</h1>}
      controls={(
        <div className="flex items-center gap-3">
          {draftSavedAt ? <div className="text-sm text-input-placeholder">Draft saved at {draftSavedAt}</div> : null}
          <Button type="button" variant="secondary" size="sm" onClick={() => window.dispatchEvent(new CustomEvent('invoice:hide-preview', { detail: { force: 'hide' } }))}>
            Hide preview
          </Button>
          {primaryCreateAction ? (
            <Button type="button" size="sm" onClick={primaryCreateAction.onClick}>
              {primaryCreateAction.label}
            </Button>
          ) : null}
        </div>
      )}
      className={layoutMode === 'desktop' ? 'px-4 py-2' : 'px-1 py-1'}
    />
  );
}
