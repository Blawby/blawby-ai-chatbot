---
title: "Form reset is allowed on close/submit, never on tab/mode/step change"
date: 2026-05-18
category: conventions
module: ui
problem_type: convention
component: forms
severity: medium
applies_when:
  - Adding a multi-mode form (signin/signup toggle, tabbed form, multi-step wizard)
  - Writing reset logic in `handleToggleMode`, `onTabChange`, `onStepChange`, or similar UI control handlers
  - Adding `useEffect` resets driven by tab/mode/step state
  - Forcing a remount with `key={mode}` or `key={activeTab}` to clear inputs
  - Reviewing a dialog form for input-loss UX bugs
related_components: ["auth", "engagements", "files", "invoices", "matters"]
tags: ["forms", "reset", "ux", "auth", "tabs", "modes", "dialogs", "preact"]
---

# Form reset is allowed on close/submit, never on tab/mode/step change

## Context

[Issue #585](https://github.com/Blawby/blawby-ai-chatbot/issues/585): users entering credentials in `AuthForm` lost their input when toggling between sign-in and sign-up. Root cause was a `setFormData({...})` call in `handleToggleMode` that ran on every mode toggle. Fixed in [PR #592](https://github.com/Blawby/blawby-ai-chatbot/pull/592).

The codebase-wide audit triggered by that issue found one bug (the above) plus a mix of reset patterns elsewhere — most intentional, some undocumented. The patterns themselves are fine; the lack of a shared rule was the maintenance hazard.

## Guidance

**Allowed resets:**

1. **On dialog open / close lifecycle for local draft state — use `useDialogFormReset`.** This is the standard shape, and the helper is required for it. The hook lives at [src/shared/ui/dialog/useDialogFormReset.ts](src/shared/ui/dialog/useDialogFormReset.ts) and is re-exported from `@/shared/ui/dialog`. It requires a `reason` string so every call site documents its trigger and UX intent inline. Pick `trigger: 'on-close'` (default) for the normal "close = cancel = fresh next open" flow; pick `trigger: 'on-open'` only when stale submit/error state on the parent could leak into the next open. Existing call sites: [UploadDestinationDialog](src/features/files/components/UploadDestinationDialog.tsx), [RefundRequestDialog](src/features/invoices/components/dialogs/RefundRequestDialog.tsx), [IntakePreviewDialog](src/features/intake/components/IntakePreviewDialog.tsx), [ConfirmationDialog](src/shared/components/ConfirmationDialog.tsx), [CreateEngagementDialog](src/features/engagements/pages/EngagementsPage.tsx).

   Don't reinvent the `useEffect(() => { if (!isOpen) … }, [isOpen])` shape inline. Code review should reject hand-rolled versions of this pattern.

2. **On successful submit.** Once the action has landed, the form is "done" — clearing is the expected next state. Reset inside the success path of the submit handler, not in a `useEffect`. Existing example: [LineItemEditorDialog.handleSaveAndAddAnother](src/features/invoices/components/LineItemEditorDialog.tsx).

3. **Switching to a different record / entity to edit.** Going from "edit milestone A" to "edit milestone B" inside the same panel is a record switch, not a UI control toggle — reset is correct. Use `formKey` increment + `key={formKey}` on the form to remount cleanly. Existing examples: [MatterMilestonesPanel](src/features/matters/components/milestones/MatterMilestonesPanel.tsx), [MatterExpensesPanel](src/features/matters/components/expenses/MatterExpensesPanel.tsx), [MatterNotesPanel](src/features/matters/components/notes/MatterNotesPanel.tsx).

**Documented exceptions to the helper rule (rule 1).** These are legitimate and stay as-is:

- **Mutation-hook `.reset()` owned by an external library.** [AddContactDialog](src/shared/ui/contacts/AddContactDialog.tsx) calls `createContact.reset()` inside `handleClose` because that reset belongs to the `useCreateContact` mutation hook, not to local component state. The helper is for local draft state; mutation libraries already own their own reset surface.
- **Lazy init from a prop where the parent's mount boundary is the lifecycle.** [LineItemEditorDialog](src/features/invoices/components/LineItemEditorDialog.tsx) uses `useState(() => item ?? newLineItem())` because callers remount the dialog per record. The lifecycle boundary is parent remount, not `isOpen`.
- **`key={formKey}` remount after submit/cancel** (the Matter\* panels listed above).

**Forbidden resets:**

4. **Switching tabs, modes, steps, or panels inside the same form** must preserve any field whose meaning is compatible across both sides. Example: sign-in and sign-up share `email` and `password` — toggling modes must not clear them. Tabs inside a single form (fee-structure tabs in `CreateEngagementDialog`) must not clear other sections' input.

5. **Conditional rendering of a field across modes** is fine — when the field unmounts (e.g. `confirmPassword` hidden in signin mode), its state stays in the parent's `formData` and reappears on toggle back. Do not "clean up" formData when the input unmounts.

6. **`key={mode}` / `key={activeTab}` on a `<Form>` or input** force a remount and lose input. Don't use this as a reset mechanism. The two legitimate uses of a `key`-driven remount are (a) switching between different records to edit (rule 3), and (b) explicit "reset form" buttons.

## Implementation rules

- **Standard dialog reset → `useDialogFormReset` only.** The hook's required `reason` field is the documentation surface. Hand-rolled `useEffect(() => { if (!isOpen) … }, [isOpen])` for local form state is rejected on review.

- **Comment the documented exceptions** (mutation-hook `.reset()`, lazy init from prop, `formKey` remount) with a one-line note that names the trigger and points back to this doc. This prevents the next contributor from migrating an exception into the helper or copy-pasting an exception's shape into a new dialog where the helper would have been correct.

- **Regression test mode toggles.** Any form with a mode/tab/step toggle that shares fields across sides needs a test that types into a shared field, toggles, and asserts the value persists. See [src/shared/components/\_\_tests\_\_/AuthForm.modeToggle.test.tsx](src/shared/components/__tests__/AuthForm.modeToggle.test.tsx) for the reference shape.

- **Do not generalize further.** The helper covers the dialog-isOpen-local-draft-state case only. It is intentionally not extended to cover tab/mode/step toggles (those should not reset at all), record-switch remounts, or mutation-hook resets. If a sixth distinct dialog-reset pattern appears, prefer documenting it as another exception above rather than overloading the hook.

## Anti-pattern (what triggered #585)

```tsx
// ❌ Don't do this
const handleToggleMode = () => {
  setMode(nextMode);
  setFormData({ name: '', email: '', password: '', confirmPassword: '' });
};
```

```tsx
// ✅ Do this — fields that exist in both modes keep their value
const handleToggleMode = () => {
  setMode(nextMode);
  setError('');
  setMessage('');
};
```
