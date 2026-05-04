# Responsive Audit

Tracks responsive coverage of every page, layout shell, and significant primitive across three target viewports. Update this file as part of every PR that lands a responsive change.

## Targets

| Tier    | Width  | Notes                       |
| ------- | ------ | --------------------------- |
| Mobile  | 375px  | iPhone SE-class             |
| Tablet  | 768px  | iPad portrait               |
| Desktop | 1440px | Standard laptop             |

Smoke specs assert no horizontal overflow at each tier (`tests/e2e/responsive-public.spec.ts`, `tests/e2e/responsive-auth.spec.ts`). Run with `npm run test:e2e:responsive` and `npm run test:e2e:responsive:auth`.

## Conventions

- **Shell + chrome** (`AppShell`, `Sidebar`, `MainApp`, routing): viewport queries (`sm:` / `md:` / `lg:`).
- **Inside the workspace** (pages, cards, forms, detail panes): container queries (`@sm:` / `@md:` / `@lg:`). The visible width depends on sidebar state and inspector panes, not viewport.
- See header comment in `tailwind.config.js`. Reference patterns: `src/shared/ui/layout/FormGrid.tsx`, `src/shared/ui/layout/ResponsiveDefinitionGrid.tsx`, `src/features/matters/components/MatterSummaryCards.tsx`.

## Legend

- ✅ verified responsive
- ⚠️ known issue (see notes)
- ⬜ unverified — needs audit

---

## Layout shells

| File                                                           | Mobile | Tablet | Desktop | Notes                                                                              |
| -------------------------------------------------------------- | :----: | :----: | :-----: | ---------------------------------------------------------------------------------- |
| `src/app/MainApp.tsx`                                          |   ⬜   |   ⬜   |    ✅   | `layoutMode` switch (widget/mobile/desktop) exists; mobile path needs verification |
| `src/shared/ui/layout/AppShell.tsx`                            |   ✅   |   ⬜   |    ✅   | Drawer + scrim + dismiss wired (`AppShell.tsx:195-211`)                            |
| `src/shared/ui/nav/Sidebar.tsx`                                |   ✅   |   ⬜   |    ✅   | Renders inside the drawer; trigger lives in `WorkspaceShellHeader.tsx:118`         |
| `src/shared/ui/nav/ClientSidebar.tsx`                          |   ✅   |   ⬜   |    ✅   | Same drawer flow as `Sidebar.tsx`                                                  |
| `src/shared/ui/nav/PracticeSidebar.tsx`                        |   ✅   |   ⬜   |    ✅   | Same drawer flow as `Sidebar.tsx`                                                  |
| `src/features/chat/pages/WorkspacePage.tsx`                    |   ✅   |   ⚠️  |    ✅   | Bottom nav overflow ("More" → drawer) wired via `NavRail` `maxItems`. Inspector panes still need full-screen overlay below `md` |

## Practice pages

| File                                                                | Mobile | Tablet | Desktop | Notes                                                                       |
| ------------------------------------------------------------------- | :----: | :----: | :-----: | --------------------------------------------------------------------------- |
| `src/pages/PracticeHomePage.tsx`                                    |   ✅   |   ✅   |    ✅   | Functional at all viewports; uses viewport queries (`sm:`/`md:`/`lg:`). Convention drift — should migrate to container queries when the file lands. |
| `src/features/matters/pages/PracticeMattersPage.tsx`                |   ✅   |   ✅   |    ✅   | Container queries throughout (`@lg:` / `@2xl:` / `@3xl:` / `@5xl:`)         |
| `src/features/matters/pages/PracticeMatterCreatePage.tsx`           |   ✅   |   ✅   |    ✅   | `max-w-6xl` cap + `px-4 py-6 sm:px-6 lg:px-8` (drift)                       |
| `src/features/clients/pages/PracticeContactsPage.tsx`               |   ✅   |   ✅   |    ✅   | `@container` on detail wrapper                                              |
| `src/features/clients/pages/PracticeContactEditorPage.tsx`          |   ✅   |   ✅   |    ✅   | `max-w-3xl` cap + responsive padding                                        |
| `src/features/intake/pages/IntakesPage.tsx`                         |   ✅   |   ✅   |    ✅   | EntityList + Avatar primitives; flex with `min-w-0 flex-1` + `truncate`     |
| `src/features/intake/pages/IntakeDetailPage.tsx`                    |   ✅   |   ✅   |    ✅   | `lg:grid-cols-[minmax(0,1fr)_280px]`, `xl:grid-cols-[minmax(0,1fr)_360px]`  |
| `src/features/intake/pages/IntakeTemplatesPage.tsx`                 |   ✅   |   ✅   |    ✅   | `grid-cols-1 sm:grid-cols-2 md:grid-cols-3`; fixed `px-6` (minor drift)     |
| `src/features/invoices/pages/PracticeInvoicesPage.tsx`              |   ⚠️  |   ⬜   |    ✅   | Uses `DataTable` — runtime verification at 375px still pending              |
| `src/features/invoices/pages/PracticeInvoiceCreatePage.tsx`         |   ✅   |   ✅   |    ✅   | `max-w-7xl` cap + responsive padding                                        |
| `src/features/invoices/pages/PracticeInvoiceEditPage.tsx`           |   ✅   |   ✅   |    ✅   | `max-w-7xl` cap + responsive padding                                        |
| `src/features/invoices/pages/PracticeInvoiceDetailPage.tsx`         |   ⬜   |   ⬜   |    ⬜   | Static scan inconclusive; needs deeper read                                  |
| `src/features/reports/pages/PracticeReportsPage.tsx`                |   ⬜   |   ⬜   |    ⬜   | Not scanned                                                                  |
| `src/features/engagements/pages/EngagementsPage.tsx`                |   ⬜   |   ⬜   |    ⬜   | Not scanned                                                                  |
| `src/features/engagements/pages/EngagementDetailPage.tsx`           |   ✅   |   ✅   |    ✅   | `grid-cols-1 sm:grid-cols-2`, `md:grid-cols-2` definition grids             |
| `src/features/practice-onboarding/pages/PracticeOnboardingPage.tsx` |   ⬜   |   ⬜   |    ⬜   | Not scanned                                                                  |

## Client pages

| File                                                          | Mobile | Tablet | Desktop | Notes                                            |
| ------------------------------------------------------------- | :----: | :----: | :-----: | ------------------------------------------------ |
| `src/pages/ClientHomePage.tsx`                                |   ✅   |   ✅   |    ✅   | Uses `WorkspaceShellHeader` + `AppShell`           |
| `src/features/matters/pages/ClientMattersPage.tsx`            |   ✅   |   ✅   |    ✅   | `sm:grid-cols-2` definition grid                   |
| `src/features/invoices/pages/ClientInvoicesPage.tsx`          |   ⚠️  |   ⬜   |    ✅   | Uses `DataTable` — runtime verification pending   |
| `src/features/invoices/pages/ClientInvoiceDetailPage.tsx`     |   ✅   |   ✅   |    ✅   | `sm:grid-cols-3`, `lg:grid-cols-3`                 |
| `src/features/payments/pages/ClientPaymentsPage.tsx`          |   ⬜   |   ⬜   |    ⬜   | Not scanned                                        |
| `src/features/engagements/pages/ClientEngagementReviewPage.tsx` |   ✅  |   ✅   |    ✅   | `max-w-2xl` cap + `px-4 py-4` / `py-8`             |

## Settings pages

| File                                                          | Mobile | Tablet | Desktop | Notes                                                |
| ------------------------------------------------------------- | :----: | :----: | :-----: | ---------------------------------------------------- |
| `src/features/settings/pages/SettingsContent.tsx`             |   ✅   |   ✅   |    ✅   | Router/wrapper for settings pages                       |
| `src/features/settings/pages/GeneralPage.tsx`                 |   ✅   |   ✅   |    ✅   | Uses `FormGrid` pattern                                 |
| `src/features/settings/pages/NotificationsPage.tsx`           |   ✅   |   ✅   |    ✅   | `SettingSection` + `SettingRow` (responsive primitives) |
| `src/features/settings/pages/SecurityPage.tsx`                |   ✅   |   ✅   |    ✅   | `SettingSection` + `SettingRow`                         |
| `src/features/settings/pages/AccountPage.tsx`                 |   ✅   |   ✅   |    ✅   | `SettingSection` + `SettingRow`; dropdown `min-w-[220px]` is local |
| `src/features/settings/pages/MFAEnrollmentPage.tsx`           |   ✅   |   ✅   |    ✅   | `max-w-md` centered card; QR-grid is contained in `w-32` |
| `src/features/settings/pages/PracticePage.tsx`                |   ✅   |   ✅   |    ✅   | Uses `FormGrid` + `EditorShell`                         |
| `src/features/settings/pages/PracticeCoveragePage.tsx`        |   ✅   |   ✅   |    ✅   | Local `max-w-[220px]` / `min-w-[120px]` are field widths |
| `src/features/settings/pages/PracticeTeamPage.tsx`            |   ✅   |   ✅   |    ✅   | `SettingSection` + `SettingRow`                         |
| `src/features/settings/pages/PayoutsPage.tsx`                 |   ✅   |   ✅   |    ✅   | Local `max-w-[220px]` is a field width                  |
| `src/features/settings/pages/AppsPage.tsx`                    |   ✅   |   ✅   |    ✅   | `SettingSection` + `SettingRow`                         |
| `src/features/settings/pages/AppDetailPage.tsx`               |   ✅   |   ✅   |    ✅   | `SettingSection` + `SettingRow`                         |
| `src/features/settings/pages/HelpPage.tsx`                    |   ✅   |   ✅   |    ✅   | `SettingSection` + `SettingRow`                         |

## Top-level pages

| File                                  | Mobile | Tablet | Desktop | Notes |
| ------------------------------------- | :----: | :----: | :-----: | ----- |
| `src/pages/AuthPage.tsx`              |   ⬜   |   ⬜   |    ⬜   |       |
| `src/pages/AcceptInvitationPage.tsx`  |   ⬜   |   ⬜   |    ⬜   |       |
| `src/pages/OnboardingPage.tsx`        |   ⬜   |   ⬜   |    ⬜   |       |
| `src/pages/PaymentResultPage.tsx`     |   ⬜   |   ⬜   |    ⬜   |       |
| `src/pages/PricingPage.tsx`           |   ⬜   |   ⬜   |    ⬜   |       |

## Practice dashboard widgets

| File                                                                       | Mobile | Tablet | Desktop | Notes                                          |
| -------------------------------------------------------------------------- | :----: | :----: | :-----: | ---------------------------------------------- |
| `src/features/practice-dashboard/components/DashboardSummaryCards.tsx`     |   ✅   |   ✅   |    ✅   | sm:/lg: variants present                                     |
| `src/features/practice-dashboard/components/RecentClientsGrid.tsx`         |   ✅   |   ✅   |    ✅   | sm:/lg: grid-cols                                            |
| `src/features/practice-dashboard/components/RecentIntakesGrid.tsx`         |   ✅   |   ✅   |    ✅   | `lg:grid-cols-3 xl:gap-x-8`; viewport queries (drift)        |
| `src/features/practice-dashboard/components/BillingActionsWidget.tsx`      |   ✅   |   ✅   |    ✅   | All vertical / flex; no fixed widths                         |
| `src/features/practice-dashboard/components/OutstandingPaymentsWidget.tsx` |   ✅   |   ✅   |    ✅   | All vertical / flex; full-width footer button                |

## Workspace views

| File                                                                          | Mobile | Tablet | Desktop | Notes                                                                              |
| ----------------------------------------------------------------------------- | :----: | :----: | :-----: | ---------------------------------------------------------------------------------- |
| Workspace home view (chat root)                                               |   ✅   |   ✅   |    ✅   | Flex layout, no hardcoded widths                                                   |
| `MobileInspectorOverlay` (`src/shared/ui/inspector/`)                         |   ✅   |   ✅   |    —    | `lg:hidden` overlay portal; takes over inspector below `lg` (1024px), full-screen  |

## Primitives

| File                                                          | Mobile | Tablet | Desktop | Notes                                                                         |
| ------------------------------------------------------------- | :----: | :----: | :-----: | ----------------------------------------------------------------------------- |
| `src/shared/ui/layout/FormGrid.tsx`                           |   ✅   |   ✅   |    ✅   | `@container` + `@md:grid-cols-2` — reference pattern                          |
| `src/shared/ui/layout/ResponsiveDefinitionGrid.tsx`           |   ✅   |   ✅   |    ✅   | `@2xl:grid-cols-2 @2xl:divide-x` — reference pattern                          |
| `src/shared/ui/layout/Page.tsx`                               |   ✅   |   ✅   |    ✅   | `px-4 py-6 sm:px-6 lg:px-8`                                                   |
| `src/features/matters/components/MatterSummaryCards.tsx`      |   ✅   |   ✅   |    ✅   | Multi-level container queries — reference pattern                             |
| DataTable (`src/shared/ui/...`)                               |   ⚠️  |   ⬜   |    ✅   | `overflow-x-auto` + `hideAt`; needs stacked card-per-row variant below `sm`   |
| Modal / Dialog primitives                                     |   ✅   |   ✅   |    ✅   | `Dialog.tsx`: `max-h-[90dvh] w-full max-w-lg`; `DialogFooter`: `flex-col-reverse sm:flex-row` |

---

## Phase plan (high level)

1. **Foundation** ✅ — Test infra + conventions doc + this checklist (commit `800a2952`).
2. **Bottom-nav overflow** ✅ — `NavRail` `maxItems` / "More" → drawer (commit `7ef7a29d`).
3. **Cleanup + visual regression** — Removed dead `WorkspaceDashboardView`; verified inspector already overlays below `lg`. Visual snapshot harness landed (see *Visual regression* below).
4. **Per-page sweeps** — dashboard widgets, settings, client pages, intake flows. In progress.

## Visual regression

`tests/e2e/responsive-screenshots.spec.ts` captures `toHaveScreenshot` baselines at 375/768/1440 for representative routes (public widget, practice home, practice matters). Not on the default CI path — run intentionally:

- `npm run test:e2e:screenshots` — compare current rendering against baselines; fails on diff.
- `npm run test:e2e:screenshots:update` — regenerate baselines. After any intentional UI change, run this, **visually review the new PNGs**, then commit them alongside the source change.

Baselines are stored under `tests/e2e/__screenshots__/`. The `snapshotPathTemplate` in the Playwright configs strips the OS suffix, so a baseline produced on Windows is comparable on Linux as long as the underlying browser version matches.
