import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { forwardRef, useImperativeHandle } from 'preact/compat';
import { Plus } from 'lucide-preact';

import { Button } from '@/shared/ui/Button';
import { Combobox, Input, Textarea } from '@/shared/ui/input';
import { asMajor, safeAdd } from '@/shared/utils/money';
import { useToastContext } from '@/shared/contexts/ToastContext';
import type { MatterDetail } from '@/features/matters/data/matterTypes';
import type { Invoice, InvoiceLineItem } from '@/features/matters/types/billing.types';
import { createInvoice, sendInvoice, updateInvoice } from '@/features/invoices/services/invoicesService';
import { InvoiceLineItemsForm } from '@/features/invoices/components/InvoiceLineItemsForm';
import { InvoicePreview } from '@/features/invoices/components/InvoicePreview';
import { SendInvoiceDialog } from '@/features/invoices/components/SendInvoiceDialog';
import type { InvoicePageMode } from '@/features/invoices/utils/invoicePageConfig';
import { buildDefaultDueDate, detectDefaultInvoiceType } from '@/features/invoices/utils/invoiceDefaults';
import { ContentWithPreview } from '@/shared/ui/layout';
import { Tabs } from '@/shared/ui/tabs';
import { AddContactDialog } from '@/shared/ui/contacts/AddContactDialog';

type InvoiceFormProps = {
  mode?: InvoicePageMode;
  practiceId: string;
  matter?: MatterDetail | null;
  connectedAccountId?: string | null;
  clientOptions?: Array<{ value: string; label: string; meta?: string }>;
  matterOptions?: Array<{ value: string; label: string; meta?: string }>;
  initialClientId?: string;
  initialMatterId?: string;
  initialLineItems?: InvoiceLineItem[];
  initialDueDate?: string;
  initialNotes?: string;
  initialMemo?: string;
  initialInvoiceType?: Invoice['invoice_type'];
  editMode?: boolean;
  readOnly?: boolean;
  invoiceContext?: 'default' | 'milestone' | 'retainer';
  existingInvoiceId?: string;
  closeAfterSuccess?: boolean;
  onClose: () => void;
  onSuccess: (invoiceId?: string | null) => Promise<void> | void;
  /** Practice name shown in the invoice preview and send dialog */
  practiceName?: string | null;
  /** Absolute URL for the practice logo (already resolved via R2 proxy) */
  practiceLogoUrl?: string | null;
  /** Practice e-mail used in the "From" block of the preview */
  practiceEmail?: string | null;
  /** Practice billing increment in minutes (e.g. 6 for 0.1h steps) */
  billingIncrementMinutes?: number | null;
  onContactCreated?: () => Promise<void> | void;
};

export type InvoiceFormHandle = {
  requestSend: () => void;
};

type InvoiceUpdatePayload = {
  due_date?: string;
  notes?: string;
  memo?: string;
  invoice_type: Invoice['invoice_type'];
  line_items: InvoiceLineItem[];
};

type InvoicePreviewTab = 'pdf' | 'email';

const INVOICE_PREVIEW_TABS = [
  { id: 'pdf', label: 'PDF' },
  { id: 'email', label: 'Email' },
];

const InvoiceEmailPlaceholder = () => (
  <div className="rounded-xl border border-line-glass/40 bg-surface-card p-5 text-sm shadow-glass">
    <p className="font-semibold text-input-text">Email preview</p>
    <p className="mt-2 text-input-placeholder">
      Coming soon. This will preview the message your client receives with the invoice payment call to action.
    </p>
  </div>
);

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const buildInvoiceUpdatePayload = ({
  dueDate,
  notes,
  memo,
  invoiceType,
  lineItems
}: {
  dueDate: string;
  notes: string;
  memo: string;
  invoiceType: Invoice['invoice_type'];
  lineItems: InvoiceLineItem[];
}): InvoiceUpdatePayload => ({
  due_date: dueDate ? new Date(`${dueDate}T00:00:00.000Z`).toISOString() : undefined,
  notes: notes.trim() || undefined,
  memo: memo.trim() || undefined,
  invoice_type: invoiceType,
  line_items: lineItems
});

export const InvoiceForm = forwardRef<InvoiceFormHandle, InvoiceFormProps>(({
  mode,
  practiceId,
  matter = null,
  connectedAccountId = null,
  clientOptions = [],
  matterOptions = [],
  initialClientId,
  initialMatterId,
  initialLineItems = [],
  initialDueDate,
  initialNotes,
  initialMemo,
  initialInvoiceType,
  editMode = false,
  readOnly = false,
  invoiceContext = 'default',
  existingInvoiceId,
  closeAfterSuccess = true,
  onClose,
  onSuccess,
  practiceName = null,
  practiceLogoUrl = null,
  practiceEmail = null,
  billingIncrementMinutes = null,
  onContactCreated,
}, ref) => {
  const { showError } = useToastContext();
  const resolvedMode: InvoicePageMode = mode ?? (readOnly ? 'readOnly' : (editMode ? 'edit' : 'create'));
  const resolvedReadOnly = resolvedMode === 'readOnly';
  const resolvedEditMode = resolvedMode !== 'create';

  const defaultInvoiceType = detectDefaultInvoiceType(
    initialLineItems,
    invoiceContext,
    matter?.billingType ?? 'fixed',
    initialInvoiceType
  );
  const [clientId, setClientId] = useState(initialClientId ?? matter?.clientId ?? '');
  const [matterId, setMatterId] = useState(initialMatterId ?? matter?.id ?? '');
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>(initialLineItems);
  const [notes, setNotes] = useState(initialNotes ?? '');
  const [memo, setMemo] = useState(initialMemo ?? '');
  const defaultDueDate = useMemo(() => buildDefaultDueDate(), []);
  const [dueDate, setDueDate] = useState(initialDueDate ?? defaultDueDate);
  const [dueDateMode, setDueDateMode] = useState<'tomorrow' | 'custom'>(() => {
    const initial = initialDueDate ?? defaultDueDate;
    return initial === defaultDueDate ? 'tomorrow' : 'custom';
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [showSendDialog, setShowSendDialog] = useState(false);
  const [addPersonOpen, setAddPersonOpen] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [createdInvoiceId, setCreatedInvoiceId] = useState<string | null>(
    resolvedEditMode ? existingInvoiceId ?? null : null
  );
  const [sendError, setSendError] = useState<string | null>(null);
  const invoiceType: Invoice['invoice_type'] = defaultInvoiceType;
  const [activePreviewTab, setActivePreviewTab] = useState<InvoicePreviewTab>('pdf');
  const isMatterScoped = Boolean(matter);
  const resolvedClientOptions = clientOptions;
  const resolvedMatterId = isMatterScoped ? matter?.id ?? '' : matterId;
  const resolvedClientId = isMatterScoped ? matter?.clientId ?? '' : clientId;
  const resolvedMatterLabel = isMatterScoped
    ? (matter?.title ?? 'Matter invoice')
    : (matterOptions.find((option) => option.value === matterId)?.label ?? '');
  const resolvedClientLabel = isMatterScoped
    ? matter?.clientName ?? ''
    : (resolvedClientOptions.find((option) => option.value === clientId)?.label ?? '');
  // Client e-mail is stored as `meta` on standalone (non-matter-scoped) options
  const resolvedClientEmail = isMatterScoped
    ? null
    : (resolvedClientOptions.find((option) => option.value === clientId)?.meta ?? null);
  const previewTitle = resolvedMatterLabel || resolvedClientLabel || 'Draft invoice';
  const previewReferenceLabel = resolvedMatterId
    ? `Matter ID: ${resolvedMatterId}`
    : resolvedClientLabel
      ? `Contact: ${resolvedClientLabel}`
      : null;
  const markDirty = useCallback(() => {
    setIsDirty(true);
  }, []);

  const handleClientChange = (nextClientId: string) => {
    setClientId(nextClientId);
    setMatterId((currentMatterId) => {
      if (!currentMatterId) return currentMatterId;
      const selectedMatter = matterOptions.find((option) => option.value === currentMatterId);
      const matterClientId = typeof selectedMatter?.meta === 'string' ? selectedMatter.meta : null;
      return !matterClientId || matterClientId === nextClientId ? currentMatterId : '';
    });
    markDirty();
  };

  const handleMatterChange = useCallback((nextMatterId: string) => {
    setMatterId(nextMatterId);
    markDirty();
  }, [markDirty]);

  const handleLineItemsChange = useCallback((nextLineItems: InvoiceLineItem[]) => {
    setLineItems(nextLineItems);
    markDirty();
  }, [markDirty]);

  const handleNotesChange = useCallback((nextNotes: string) => {
    setNotes(nextNotes);
    markDirty();
  }, [markDirty]);

  const handleMemoChange = useCallback((nextMemo: string) => {
    setMemo(nextMemo);
    markDirty();
  }, [markDirty]);

  const handleDueDateChange = useCallback((nextDueDate: string) => {
    setDueDate(nextDueDate);
    markDirty();
  }, [markDirty]);

  const handleDueDateModeChange = useCallback((nextMode: 'tomorrow' | 'custom') => {
    setDueDateMode(nextMode);
    markDirty();
  }, [markDirty]);

  const total = useMemo(() => lineItems.reduce((acc, item) => safeAdd(acc, item.line_total), asMajor(0)), [lineItems]);
  const previewIssueDateRef = useRef(new Date());
  const previewIssueDate = previewIssueDateRef.current;

  // Preview toggle and last-saved timestamp
  const [showPreview, setShowPreview] = useState(true);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  const isValidConnectedAccount = useMemo(
    () => Boolean(connectedAccountId && UUID_REGEX.test(connectedAccountId)),
    [connectedAccountId]
  );
  const disableActions = isSaving || isSending || resolvedReadOnly || !isValidConnectedAccount || lineItems.length === 0;

  const openSendDialog = useCallback(() => {
    if (resolvedReadOnly) return;
    if (!isValidConnectedAccount) {
      showError('Cannot send invoice', 'Complete Stripe onboarding before sending invoices.');
      return;
    }
    if (!resolvedClientId) {
      showError('Cannot send invoice', 'Choose a contact first.');
      return;
    }
    if (lineItems.length === 0) {
      showError('Cannot send invoice', 'Add at least one line item.');
      return;
    }
    if (isSaving || isSending) return;
    setShowSendDialog(true);
  }, [isSaving, isSending, isValidConnectedAccount, lineItems.length, resolvedClientId, resolvedReadOnly, showError]);

  const buildCreatePayload = (accountId: string) => ({
    client_id: resolvedClientId,
    matter_id: resolvedMatterId || undefined,
    connected_account_id: accountId,
    invoice_type: invoiceType,
    due_date: dueDate ? new Date(`${dueDate}T00:00:00.000Z`).toISOString() : undefined,
    notes: notes.trim() || undefined,
    memo: memo.trim() || undefined,
    line_items: lineItems
  });

  const finalizeSuccess = async (invoiceId: string | null) => {
    await onSuccess(invoiceId);
    if (closeAfterSuccess) {
      onClose();
    }
  };

  const ensureInvoicePersisted = async () => {
    if (resolvedEditMode && existingInvoiceId) {
      if (!isDirty) return existingInvoiceId;
      const updated = await updateInvoice(practiceId, existingInvoiceId, buildInvoiceUpdatePayload({
        dueDate,
        notes,
        memo,
        invoiceType,
        lineItems
      }));
      const nextInvoiceId = updated?.id ?? existingInvoiceId;
      setCreatedInvoiceId(nextInvoiceId);
      setIsDirty(false);
      setLastSavedAt(new Date());
      return nextInvoiceId;
    }

    if (createdInvoiceId) {
      if (!isDirty) return createdInvoiceId;
      const updated = await updateInvoice(practiceId, createdInvoiceId, buildInvoiceUpdatePayload({
        dueDate,
        notes,
        memo,
        invoiceType,
        lineItems
      }));
      const nextInvoiceId = updated?.id ?? createdInvoiceId;
      setCreatedInvoiceId(nextInvoiceId);
      setIsDirty(false);
      setLastSavedAt(new Date());
      return nextInvoiceId;
    }

    if (!connectedAccountId) {
      throw new Error('Stripe onboarding account is required.');
    }
    const created = await createInvoice(practiceId, buildCreatePayload(connectedAccountId));
    const nextInvoiceId = created?.id ?? null;
    if (!nextInvoiceId) {
      throw new Error('Invoice ID missing in create response.');
    }
    setCreatedInvoiceId(nextInvoiceId);
    setIsDirty(false);
    setLastSavedAt(new Date());
    return nextInvoiceId;
  };

  const sendPersistedInvoice = async (invoiceId: string) => {
    await sendInvoice(practiceId, invoiceId);
    await finalizeSuccess(invoiceId);
  };

  const handleSendInvoice = async () => {
    if (!resolvedClientId) {
      showError('Could not send invoice', 'Choose a contact before creating the invoice.');
      return;
    }
    if (disableActions || !connectedAccountId) return;
    setIsSaving(true);
    setIsSending(true);
    setSendError(null);
    try {
      const invoiceId = await ensureInvoicePersisted();
      await sendPersistedInvoice(invoiceId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to send invoice';
      setSendError(message);
    } finally {
      setIsSending(false);
      setIsSaving(false);
      setShowSendDialog(false);
    }
  };

  useImperativeHandle(ref, () => ({
    requestSend: openSendDialog,
  }), [openSendDialog]);

  // Notify global shell about draft saves so the global header can show the timestamp
  useEffect(() => {
    if (!lastSavedAt) return;
    try {
      const detail = { timestamp: lastSavedAt.toISOString() };
      window.dispatchEvent(new CustomEvent('invoice:draft-saved', { detail }));
    } catch (_err) {
      // ignore (server-side rendering or unavailable window)
    }
  }, [lastSavedAt]);

  // Listen for global hide-preview events so the header button can toggle the preview
  useEffect(() => {
    const handler = (ev: Event) => {
      const ce = ev as CustomEvent;
      // If detail.force === 'show' we show it; if 'hide' we hide; otherwise toggle
      const force = ce?.detail?.force as string | undefined;
      if (force === 'show') setShowPreview(true);
      else if (force === 'hide') setShowPreview(false);
      else setShowPreview((v) => !v);
    };
    window.addEventListener('invoice:hide-preview', handler as EventListener);
    return () => window.removeEventListener('invoice:hide-preview', handler as EventListener);
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <ContentWithPreview
        className="flex-1"
        contentClassName="space-y-5"
        /* Let the parent shell/header render the page-level header. */
        preview={ showPreview ? (
          <>
            <div className="mb-3">
              <Tabs
                items={INVOICE_PREVIEW_TABS}
                activeId={activePreviewTab}
                onChange={(id) => setActivePreviewTab(id as InvoicePreviewTab)}
              />
            </div>
            {activePreviewTab === 'pdf' ? (
              <InvoicePreview
                title={previewTitle}
                referenceLabel={previewReferenceLabel}
                lineItems={lineItems}
                issueDate={previewIssueDate}
                dueDate={dueDate}
                practiceName={practiceName}
                practiceLogoUrl={practiceLogoUrl}
                practiceEmail={practiceEmail}
                clientName={resolvedClientLabel || null}
                clientEmail={resolvedClientEmail}
                billingIncrementMinutes={billingIncrementMinutes}
                notes={notes || null}
              />
            ) : (
              <InvoiceEmailPlaceholder />
            )}
          </>
        ) : null }
      >
        {activePreviewTab === 'email' ? (
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-input-text">Email delivery</h3>
            <p className="text-sm text-input-placeholder">
              Email copy controls will live here. For now, use the PDF tab to edit invoice details.
            </p>
          </section>
        ) : (
          <>
            {!resolvedReadOnly && !isValidConnectedAccount ? (
              <div className="status-warning rounded-xl px-4 py-3 text-sm">
                Complete Stripe onboarding to enable invoicing.
              </div>
            ) : null}
            {!isMatterScoped ? (
              <div className="space-y-4">
                <Combobox
                  label="Contact"
                  value={clientId}
                  onChange={handleClientChange}
                  options={resolvedClientOptions}
                  placeholder="Choose a contact"
                  disabled={resolvedReadOnly}
                  footer={!resolvedReadOnly ? (
                    (close) => (
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-accent-utility hover:bg-surface-utility/10"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          close();
                          setAddPersonOpen(true);
                        }}
                      >
                        <Plus className="h-4 w-4" />
                        Invite contact
                      </button>
                    )
                  ) : undefined}
                />
                <Combobox
                  label="Matter (optional)"
                  value={matterId}
                  onChange={handleMatterChange}
                  options={matterOptions.filter((option) => {
                    if (!clientId) return true;
                    const clientMatch = typeof option.meta === 'string' ? option.meta : null;
                    return !clientMatch || clientMatch === clientId;
                  }).map((option) => ({
                    value: option.value,
                    label: option.label,
                  }))}
                  placeholder={clientId ? 'Link a matter' : 'Choose a contact first'}
                  disabled={resolvedReadOnly || !clientId}
                  clearable
                />
              </div>
            ) : null}
            <InvoiceLineItemsForm
              lineItems={lineItems}
              onChange={handleLineItemsChange}
              billingIncrementMinutes={billingIncrementMinutes}
              readOnly={resolvedReadOnly}
            />
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-input-text">Request payment</h3>
              <p className="text-xs text-input-placeholder">
                Choose when this invoice should be due.
              </p>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm text-input-text">
                  <input
                    type="radio"
                    name="due-date-mode"
                    checked={dueDateMode === 'tomorrow'}
                    onChange={() => {
                      handleDueDateModeChange('tomorrow');
                      handleDueDateChange(defaultDueDate);
                    }}
                    disabled={resolvedReadOnly}
                  />
                  <span>Due tomorrow ({defaultDueDate})</span>
                </label>
                <label className="flex items-center gap-2 text-sm text-input-text">
                  <input
                    type="radio"
                    name="due-date-mode"
                    checked={dueDateMode === 'custom'}
                    onChange={() => handleDueDateModeChange('custom')}
                    disabled={resolvedReadOnly}
                  />
                  <span>Custom due date</span>
                </label>
              </div>
              {dueDateMode === 'custom' ? (
                <Input
                  label="Due date"
                  type="date"
                  value={dueDate}
                  onChange={handleDueDateChange}
                  disabled={resolvedReadOnly}
                  min={defaultDueDate}
                />
              ) : null}
            </section>
            <Textarea label="Notes to client" value={notes} onChange={handleNotesChange} rows={3} disabled={resolvedReadOnly} />
            <Textarea label="Internal memo" value={memo} onChange={handleMemoChange} rows={2} disabled={resolvedReadOnly} />
            {sendError ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                <p>{sendError}</p>
                {createdInvoiceId ? (
                  <div className="mt-2">
                    <Button size="sm" onClick={handleSendInvoice} disabled={isSending}>
                      Retry send
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </ContentWithPreview>

      {!resolvedReadOnly ? (
        <SendInvoiceDialog
          isOpen={showSendDialog}
          totalAmount={total}
          onConfirm={handleSendInvoice}
          onCancel={() => setShowSendDialog(false)}
          loading={isSending}
          lineItems={lineItems}
          dueDate={dueDate}
          previewTitle={previewTitle}
          previewReferenceLabel={previewReferenceLabel}
          previewIssueDate={previewIssueDate}
          practiceName={practiceName}
          practiceLogoUrl={practiceLogoUrl}
          practiceEmail={practiceEmail}
          clientName={resolvedClientLabel || null}
          clientEmail={resolvedClientEmail}
          billingIncrementMinutes={billingIncrementMinutes}
          previewNotes={notes || null}
        />
      ) : null}
      <AddContactDialog
        practiceId={practiceId}
        isOpen={addPersonOpen}
        onClose={() => setAddPersonOpen(false)}
        onSuccess={onContactCreated}
      />
    </div>
  );
});
