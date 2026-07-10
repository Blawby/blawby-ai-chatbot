# Client Workspace Parity

Client workspace routes must use the same shell/composer primitives as practice routes, but they must not call practice-only APIs.

## Frontend contract

- `/client/:practiceSlug` renders through `MainApp` and `WorkspacePage`; do not add another standalone client shell.
- Client home content lives in `src/features/chat/components/WorkspaceHomeSection.tsx` and `src/features/client-dashboard`.
- Client matter screens must use the `listClientMatters`, `getClientMatter`, `getClientMatterActivity`, `listClientMatterNotes`, and `listClientMatterTasks` helpers from `src/features/matters/services/mattersApi.ts`.
- Client settings must not fetch practice setup or Stripe payout state. `useWorkspaceSetup` gates setup, team, and payout fetches behind `isPracticeWorkspace`.
- `BrandMark` owns the Blawby logo and wordmark. Do not reintroduce a letter-only logo in client shells.

## Backend requirements

The frontend expects client-safe backend endpoints that authorize by the authenticated client identity, not by practice staff membership:

- `GET /api/matters/:practiceId/client`
- `GET /api/matters/:practiceId/client/:matterId`
- `GET /api/matters/:practiceId/client/:matterId/activity`
- `GET /api/matters/:practiceId/client/:matterId/notes`
- `GET /api/matters/:practiceId/client/:matterId/tasks`
- `GET /api/invoices/:practiceId/client`
- `GET /api/invoices/:practiceId/client/:invoiceId`

Client routes must be registered before dynamic `/:practice_id/:id` routes so static segments like `client` are not parsed as UUID params. Matter client routes must authorize by resolving `ctx.userId` to that user's client record in the organization, then filtering/validating matters by `client_id`.
