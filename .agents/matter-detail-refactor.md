# Matter Detail Page — Tab Structure

## Tab layout

```
Overview | Work | Notes | Billing | Files | Activity | Settings
```

### Work (segmented filter, not tabs)
```
[Tasks] [Milestones]
```

### Billing (segmented filter, not tabs)
```
[Unbilled] [Time] [Expenses] [Rates]
```

## Clean model

- **Work** = what needs to happen (Tasks, Milestones)
- **Notes** = internal written context (top-level tab)
- **Billing** = what needs to be charged (Unbilled, Time, Expenses, Rates)
- **Files** = documents
- **Activity** = audit trail
- **Settings** = matter configuration

## Domain rules

- A matter never exists without an engagement. Never show "Create engagement" CTA.
- Lawyers do NOT have "tracked/manual/overtime" time concepts. Time is just time.
- Expenses belong in Billing (they affect invoicing and reimbursement).
- Milestones in Work represent case progress/phases. Billing milestones (tied to fixed-fee payment) also appear in Billing unbilled section via `UnbilledSummaryCard`.

## Implementation status

All changes have been implemented and compile with zero TypeScript errors.

### Files created
- `src/shared/ui/tabs/SegmentedFilter.tsx` — Pill-style toggle for inner controls (used by Work and Billing tabs)
- `src/features/matters/components/MatterNotesTab.tsx` — Notes as top-level tab (extracted from MatterWorkTab)

### Files modified
- `MatterDetailPanel.tsx` — Added 'notes' to `DetailSectionId`, 7 tabs, `notes` prop group
- `MatterWorkTab.tsx` — Removed Notes + Expenses sub-tabs, kept Tasks + Milestones only, switched from `Tabs` to `SegmentedFilter`
- `MatterBillingTab.tsx` — Added 4 segments (Unbilled/Time/Expenses/Rates), added expense + invoice + unbilled props, `BillingSubTab` type
- `MatterSettingsTab.tsx` — Two-column `@3xl:grid-cols-2` layout, danger zone with `border-rose-500/50`
- `MatterActivityTab.tsx` — Already had search/filter bar (no changes needed)
- `PracticeMattersPage.tsx` — Updated routing (`billingSubTab`, `isBillingSubTab`), generalized `goToDetail` sub-tab param, moved expenses from work to billing props, extracted notes to own prop group, updated header nav targets

### Files unchanged
- `MatterFilesTab.tsx` — Delegates to `MatterFilesPanel`, already complete
- `MatterOverviewTab.tsx` — Needs domain rule compliance review (separate task)
