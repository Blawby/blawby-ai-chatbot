# Financial action launch verification

This document maps #719 to deterministic evidence. Stripe webhook verification and invoice persistence remain backend-owned; backend issue Blawby/blawby-backend#369 and PR Blawby/blawby-backend#370 contain the focused backend fix and proofs for human review and merge.

| Launch guarantee | Enforcement | Automated evidence |
| --- | --- | --- |
| Invoice ownership | Practice invoice routes are authorized against the requested Practice. Client invoice identity is derived from the authenticated user, never accepted from request input, and queries include both Practice and client identifiers. | `tests/e2e/security-isolation.spec.ts`, backend `test/invoices/invoice-access-safety.test.ts`, and the billing E2E owner/client detail assertions. |
| Signature and replay safety | Stripe signatures are verified before event storage. Stripe event IDs are unique and are reused as Graphile job keys; processed event replays do not enqueue or mutate again. Invalid-signature logs contain only the webhook path. | Backend `test/modules/webhooks/financial-webhook-safety.test.ts` and `test/modules/webhooks/webhook-job-idempotency.test.ts`. |
| Invoice lifecycle integrity | Frontend send, sync, paid, void, and refund views consume backend invoice state. The billing E2E sends the exact draft, follows the returned Stripe hosted URL, syncs from Stripe, and requires owner and client views to converge on paid state. | `tests/e2e/billing-invoicing.spec.ts` and invoice service/component tests. |
| Mandatory approval | Every assistant create, update, delete, and lifecycle tool produces a stored pending action. Approval executes only the stored payload. The action row is scoped to its Practice, execution is claimed once, and outbound writes carry an action-bound idempotency key. | `tests/unit/practiceAssistant/billingWorkflow.test.ts`, `tests/unit/practiceAssistant/toolRegistry.test.ts`, and `tests/unit/practiceAssistant/actionExecutionSafety.test.ts`. |
| Sanitized correlation | Failed action rows store only an opaque correlation reference. The same reference is returned in the sanitized 500 response and centralized logs omit unexpected messages and stacks. | `tests/unit/practiceAssistant/actionExecutionSafety.test.ts` and `tests/unit/worker/errorHandler.test.ts`. |

Backend PR #370 is intentionally not a frontend merge dependency. The frontend staging work may finish while that PR awaits human review and merge.
