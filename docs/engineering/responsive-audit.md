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
| `src/shared/ui/layout/AppShell.tsx`                            |   ⚠️  |   ⬜   |    ✅   | Drawer scaffolding present; no hamburger trigger wired                             |
| `src/shared/ui/nav/Sidebar.tsx`                                |   ⚠️  |   ⬜   |    ✅   | 260/64px adaptive on desktop; mobile drawer overlay needs trigger + swipe dismiss  |
| `src/shared/ui/nav/ClientSidebar.tsx`                          |   ⚠️  |   ⬜   |    ✅   | Same drawer issue as `Sidebar.tsx`                                                 |
| `src/shared/ui/nav/PracticeSidebar.tsx`                        |   ⚠️  |   ⬜   |    ✅   | Same drawer issue as `Sidebar.tsx`                                                 |
| `src/features/chat/pages/WorkspacePage.tsx`                    |   ⚠️  |   ⚠️  |    ✅   | Inspector panes need to collapse to full-screen overlay below `md`                 |

## Practice pages

| File                                                                | Mobile | Tablet | Desktop | Notes                                                                       |
| ------------------------------------------------------------------- | :----: | :----: | :-----: | --------------------------------------------------------------------------- |
| `src/pages/PracticeHomePage.tsx`                                    |   ⬜   |   ⬜   |    ✅   |                                                                             |
| `src/features/matters/pages/PracticeMattersPage.tsx`                |   ✅   |   ✅   |    ✅   | Container queries throughout (`@lg:` / `@2xl:` / `@3xl:` / `@5xl:`)         |
| `src/features/matters/pages/PracticeMatterCreatePage.tsx`           |   ⬜   |   ⬜   |    ⬜   |                                                                             |
| `src/features/clients/pages/PracticeContactsPage.tsx`               |   ⬜   |   ⬜   |    ✅   | `@container` on detail wrapper                                              |
| `src/features/clients/pages/PracticeContactEditorPage.tsx`          |   ⬜   |   ⬜   |    ⬜   |                                                                             |
| `src/features/intake/pages/IntakesPage.tsx`                         |   ⬜   |   ⬜   |    ⬜   |                                                                             |
| `src/features/intake/pages/IntakeDetailPage.tsx`                    |   ⬜   |   ⬜   |    ⬜   |                                                                             |
| `src/features/intake/pages/IntakeTemplatesPage.tsx`                 |   ⬜   |   ⬜   |    ⬜   |                                                                             |
| `src/features/invoices/pages/PracticeInvoicesPage.tsx`              |   ⚠️  |   ⬜   |    ✅   | Uses `DataTable` (overflow issue below `sm`)                                |
| `src/features/invoices/pages/PracticeInvoiceCreatePage.tsx`         |   ⬜   |   ⬜   |    ⬜   |                                                                             |
| `src/features/invoices/pages/PracticeInvoiceEditPage.tsx`           |   ⬜   |   ⬜   |    ⬜   |                                                                             |
| `src/features/invoices/pages/PracticeInvoiceDetailPage.tsx`         |   ⬜   |   ⬜   |    ⬜   |                                                                             |
| `src/features/reports/pages/PracticeReportsPage.tsx`                |   ⬜   |   ⬜   |    ⬜   |                                                                             |
| `src/features/engagements/pages/EngagementsPage.tsx`                |   ⬜   |   ⬜   |    ⬜   |                                                                             |
| `src/features/engagements/pages/EngagementDetailPage.tsx`           |   ⬜   |   ⬜   |    ⬜   |                                                                             |
| `src/features/practice-onboarding/pages/PracticeOnboardingPage.tsx` |   ⬜   |   ⬜   |    ⬜   |                                                                             |

## Client pages

| File                                                          | Mobile | Tablet | Desktop | Notes                                            |
| ------------------------------------------------------------- | :----: | :----: | :-----: | ------------------------------------------------ |
| `src/pages/ClientHomePage.tsx`                                |   ⬜   |   ⬜   |    ✅   |                                                  |
| `src/features/matters/pages/ClientMattersPage.tsx`            |   ⬜   |   ⬜   |    ⬜   |                                                  |
| `src/features/invoices/pages/ClientInvoicesPage.tsx`          |   ⚠️  |   ⬜   |    ✅   | Uses `DataTable` (overflow issue below `sm`)     |
| `src/features/invoices/pages/ClientInvoiceDetailPage.tsx`     |   ⬜   |   ⬜   |    ⬜   |                                                  |
| `src/features/payments/pages/ClientPaymentsPage.tsx`          |   ⬜   |   ⬜   |    ⬜   |                                                  |
| `src/features/engagements/pages/ClientEngagementReviewPage.tsx` |   ⬜  |   ⬜   |    ⬜   |                                                  |

## Settings pages

| File                                                          | Mobile | Tablet | Desktop | Notes                                                |
| ------------------------------------------------------------- | :----: | :----: | :-----: | ---------------------------------------------------- |
| `src/features/settings/pages/SettingsContent.tsx`             |   ⬜   |   ⬜   |    ⬜   |                                                      |
| `src/features/settings/pages/GeneralPage.tsx`                 |   ✅   |   ✅   |    ✅   | Uses `FormGrid` pattern                              |
| `src/features/settings/pages/NotificationsPage.tsx`           |   ⬜   |   ⬜   |    ⬜   |                                                      |
| `src/features/settings/pages/SecurityPage.tsx`                |   ⬜   |   ⬜   |    ⬜   |                                                      |
| `src/features/settings/pages/AccountPage.tsx`                 |   ⬜   |   ⬜   |    ⬜   |                                                      |
| `src/features/settings/pages/MFAEnrollmentPage.tsx`           |   ⬜   |   ⬜   |    ⬜   |                                                      |
| `src/features/settings/pages/PracticePage.tsx`                |   ⬜   |   ⬜   |    ⬜   |                                                      |
| `src/features/settings/pages/PracticeCoveragePage.tsx`        |   ⬜   |   ⬜   |    ⬜   |                                                      |
| `src/features/settings/pages/PracticeTeamPage.tsx`            |   ⬜   |   ⬜   |    ⬜   |                                                      |
| `src/features/settings/pages/PayoutsPage.tsx`                 |   ⬜   |   ⬜   |    ⬜   |                                                      |
| `src/features/settings/pages/AppsPage.tsx`                    |   ⬜   |   ⬜   |    ⬜   |                                                      |
| `src/features/settings/pages/AppDetailPage.tsx`               |   ⬜   |   ⬜   |    ⬜   |                                                      |
| `src/features/settings/pages/HelpPage.tsx`                    |   ⬜   |   ⬜   |    ⬜   |                                                      |

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
| `src/features/practice-dashboard/components/DashboardSummaryCards.tsx`     |   ✅   |   ✅   |    ✅   | sm:/lg: variants present                       |
| `src/features/practice-dashboard/components/RecentClientsGrid.tsx`         |   ✅   |   ✅   |    ✅   | sm:/lg:grid-cols                               |
| `src/features/practice-dashboard/components/RecentIntakesGrid.tsx`         |   ⬜   |   ⬜   |    ⬜   |                                                |
| `src/features/practice-dashboard/components/BillingActionsWidget.tsx`      |   ⬜   |   ⬜   |    ⬜   | No responsive variants — needs verification    |
| `src/features/practice-dashboard/components/OutstandingPaymentsWidget.tsx` |   ⬜   |   ⬜   |    ⬜   | No responsive variants — needs verification    |

## Workspace views

| File                                                                          | Mobile | Tablet | Desktop | Notes                                          |
| ----------------------------------------------------------------------------- | :----: | :----: | :-----: | ---------------------------------------------- |
| Workspace home view (chat root)                                               |   ✅   |   ✅   |    ✅   | Flex layout, no hardcoded widths               |
| `WorkspaceDashboardView` (within WorkspacePage)                               |   ⚠️  |   ⬜   |    ✅   | `max-w-5xl` cap doesn't adapt to narrow shell  |

## Primitives

| File                                                          | Mobile | Tablet | Desktop | Notes                                                                         |
| ------------------------------------------------------------- | :----: | :----: | :-----: | ----------------------------------------------------------------------------- |
| `src/shared/ui/layout/FormGrid.tsx`                           |   ✅   |   ✅   |    ✅   | `@container` + `@md:grid-cols-2` — reference pattern                          |
| `src/shared/ui/layout/ResponsiveDefinitionGrid.tsx`           |   ✅   |   ✅   |    ✅   | `@2xl:grid-cols-2 @2xl:divide-x` — reference pattern                          |
| `src/shared/ui/layout/Page.tsx`                               |   ✅   |   ✅   |    ✅   | `px-4 py-6 sm:px-6 lg:px-8`                                                   |
| `src/features/matters/components/MatterSummaryCards.tsx`      |   ✅   |   ✅   |    ✅   | Multi-level container queries — reference pattern                             |
| DataTable (`src/shared/ui/...`)                               |   ⚠️  |   ⬜   |    ✅   | `overflow-x-auto` + `hideAt`; needs stacked card-per-row variant below `sm`   |
| Modal / Dialog primitives                                     |   ⬜   |   ⬜   |    ⬜   | `DialogFooter`/`DialogBody` — verify `max-h-[90dvh]` + footer stack below sm  |

---

## Phase plan (high level)

1. **Foundation** — this PR. Test infra + conventions doc + this checklist. No visible changes.
2. **Shared primitives** — DataTable stacked variant, Sidebar drawer trigger + bottom-tab integration (`workspaceShell.ts:301`), modal responsiveness.
3. **Workspace shell + nav** — drop `WorkspaceDashboardView` `max-w-5xl`; inspector overlay below `md`.
4. **Per-page sweeps** — dashboard widgets, settings, client pages, intake flows.
5. **Visual snapshot regression** — `toHaveScreenshot` for top routes at all three viewports.
