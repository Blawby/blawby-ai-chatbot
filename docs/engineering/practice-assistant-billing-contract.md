# Practice Assistant billing contract

Tracks [#705](https://github.com/Blawby/blawby-ai-chatbot/issues/705) and launch readiness [#714](https://github.com/Blawby/blawby-ai-chatbot/issues/714).

## Ownership

- The Worker owns model orchestration, tool permission checks, pending-action persistence, approval/rejection, and audit events.
- The backend owns matters, clients, time entries, expenses, invoices, invoice lifecycle actions, and persisted billing state.
- The model never writes billing data directly. It selects capability-oriented tools and receives their results.

## Supported flow

1. Read a known matter and its `time_entry` / `matter_expense` children, or query related practice records.
2. Propose `create_entity` with `entityType: "invoice"` and the backend draft fields.
3. Persist the proposal in `practice_assistant_actions` with status `pending`; no backend write occurs yet.
4. The owner approves or rejects the action through `/api/ai/practice-assistant/actions/:actionId/:decision`.
5. Approval executes `POST /api/invoices/:practiceId` and records `executed` or `failed` from the backend result.
6. Sending is a separate `run_entity_action` proposal with action `send`; it also requires explicit approval before `POST /api/invoices/:practiceId/:invoiceId/send`.

## Draft contract

Required fields match the backend create schema:

- `client_id`
- `connected_account_id`
- at least one `line_items` entry containing `type`, `description`, and `unit_price`

Optional supported fields are `matter_id`, `invoice_number`, `invoice_type`, `due_date`, `notes`, `memo`, `time_entry_ids`, `expense_ids`, and `milestone_id`.

The assistant rejects unknown fields, missing required fields, empty line items, malformed line items, and unsupported invoice lifecycle actions before presenting an approval card.

## Stable verification boundary

Automated coverage supplies deterministic model-style tool calls at the tool executor boundary. It asserts backend-sourced reads, valid pending draft creation, invalid proposal rejection before approval, and a separately pending send action. Assertions intentionally avoid generated prose and live-model selection so billing safety and CI reliability do not depend on wording or model nondeterminism.

The deterministic owner/client/Stripe payment path remains in `tests/e2e/billing-invoicing.spec.ts`; assistant tests do not duplicate or couple themselves to hosted payment reliability.
