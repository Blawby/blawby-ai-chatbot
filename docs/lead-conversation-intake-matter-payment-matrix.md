# Lead Conversation Intake Matter Payment Matrix

This is the field and lifecycle matrix for the current system across:

- lead
- conversation
- intake
- matter
- payment

Use this as the quick source-of-truth doc when we are trying to answer:

- where a piece of data first appears
- which repo owns it
- what links one stage to the next
- what is automated today vs manual

Related architecture doc: [blawby-system-current-vs-goal.md](./blawby-system-current-vs-goal.md)

## Lifecycle Matrix

| Stage | Primary concept today | System of record | Repo owner | Main identifiers | Who creates it | Main next links |
| --- | --- | --- | --- | --- | --- | --- |
| Lead | A prospect showing intent through chat/contact/intake activity | Split between conversation context and intake metadata | Worker + backend | No dedicated `lead` entity confirmed in current code | Prospect starts widget/chat or public intake flow | Conversation, intake |
| Conversation | Realtime messaging thread for prospect/client/practice interaction | Worker runtime storage | `blawby-ai-chatbot` | `conversation.id` | Worker conversation flow | Intake via `conversation_id`, later matter via `conversation_id` |
| Intake | Structured practice-client-intake record with payment + triage state | Backend Postgres | `blawby-backend` | `practice_client_intakes.id` | Backend service | Matter via `intake_uuid`, payment via Stripe ids |
| Matter | Durable legal work item/case record | Backend Postgres | `blawby-backend` | `matters.id` | Backend service, often from intake conversion | Invoices, time, expenses, milestones, tasks, retainer balance |
| Payment | Stripe-side payment artifacts for intake or invoice collection | Stripe plus backend references | Mostly `blawby-backend` | `stripe_payment_link_id`, `stripe_checkout_session_id`, `stripe_payment_intent_id`, `stripe_charge_id` | Backend Stripe flows | Intake status, invoice/payment reporting, payout flow |

## Ownership Matrix

| Concern | Worker today | Backend today | Notes |
| --- | --- | --- | --- |
| Realtime chat | Yes | No | Worker owns WebSockets, messages, conversation access rules, and local chat persistence |
| AI conversation behavior | Yes | No direct evidence in reviewed modules | Worker handles AI chat, intent, search, and website extraction |
| Lead capture | Partial | Partial | Lead is still a product concept spread across conversation + intake, not a clean standalone entity |
| Intake creation | Proxy entrypoint only | Yes | Backend owns intake persistence, validation, Stripe setup, and triage status |
| Intake payment setup | No durable ownership | Yes | Backend creates payment links and checkout sessions |
| Matter creation | No durable ownership | Yes | Backend owns create/update/list and intake-to-matter conversion |
| Notifications | Partial | Partial | Worker has queue/OneSignal delivery; backend has email templates and workers |
| Business billing rules | No | Yes | Invoice routing, trust/operating logic, subscriptions, and onboarding live in backend |

## Linking Keys Matrix

| From | To | Linking field(s) | Direction today | Notes |
| --- | --- | --- | --- | --- |
| Conversation | Intake | `practice_client_intakes.conversation_id` | Direct | Intake can be created with a conversation id |
| Intake | Matter | `matters.intake_uuid` | Direct | Conversion writes intake uuid into matter |
| Intake | Matter | `matters.conversation_id` | Direct carry-over | Conversion also writes the intake's conversation id into matter |
| Intake | Payment | `stripe_payment_link_id`, `stripe_checkout_session_id`, `stripe_payment_intent_id`, `stripe_charge_id` | Direct | Stripe ids live on intake |
| Matter | Client | `matters.client_id` | Direct | Uses `user_details.id` when available |
| Matter | Practice service | `matters.practice_service_id` | Direct | Connects matter to practice-configured service area |
| Matter | Billing state | `retainer_balance`, billing fields, invoice relations | Direct | Matter becomes the anchor for downstream billing work |

## Status Matrix

| Domain | Current statuses seen in code | Meaning |
| --- | --- | --- |
| Intake payment/status | `open`, `succeeded`, `expired`, `canceled`, `failed`, `converted` | Payment and lifecycle state of the intake |
| Intake triage | `pending_review`, `accepted`, `declined` | Practice review outcome before matter conversion |
| Matter status | Enum comes from matter validations; current docs/examples include states like `first_contact`, `engagement_pending`, `draft`, `active` | Matter lifecycle state is backend-owned and broader than intake triage |

## Field Carry-Forward Matrix

| Source at intake | Destination at matter conversion | Current behavior |
| --- | --- | --- |
| `id` | `matters.intake_uuid` | Copied |
| `conversation_id` | `matters.conversation_id` | Copied |
| `metadata.user_id` | `matters.client_id` | Copied only if matching `user_details` record exists |
| `metadata.name` | Matter title fallback | Used as `Intake: {name}` when no explicit title passed |
| `metadata.description` | `matters.description` | Copied |
| `urgency` | `matters.urgency` | Copied with fallback to `routine` |
| `metadata.on_behalf_of` | `matters.on_behalf_of` | Copied |
| `metadata.opposing_party` | `matters.opposing_party` | Copied |
| `metadata.opposing_counsel` | `matters.opposing_counsel` | Copied |
| `court_date` | Matter milestone | Converted into a milestone called `Court Date from Intake` |
| `desired_outcome` | Matter note | Written into notes, not a top-level matter field |
| `case_strength` | Matter note | Written into notes, not a top-level matter field |
| Intake payment state | Matter field | Not copied directly as a matter field |

## Automation Matrix

| Step | Automated today | Current implementation shape | Manual/decision point still present |
| --- | --- | --- | --- |
| Prospect starts chat | Yes | Worker conversation flow | None |
| Conversation exists in realtime thread | Yes | Worker conversations/WebSockets | None |
| Intake created | Yes, when flow submits | Backend intake service | Depends on frontend/worker flow invoking it |
| Payment link or checkout session created | Yes | Backend Stripe setup | Depends on payment-required settings and flow path |
| Intake status moves to paid/succeeded | Yes | Stripe webhook/backend lifecycle | Stripe outcome driven |
| Triage decision | No | Backend supports update | Practice/team still decides accepted vs declined |
| Intake converts to matter | Supported, not fully automatic | Backend conversion service | Requires accepted + succeeded intake and an explicit conversion action |
| Matter billing starts | Partial | Matter/invoice systems exist | Workflow after matter creation is not fully auto-stitched |
| Payment reminders | Partial at best | Pieces exist across billing/email | No single clear end-to-end reminder pipeline documented in reviewed code |

## What Exists Today By Stage

### Lead

There is no single reviewed backend table or worker table that clearly acts as the canonical `lead` entity. Today the practical lead concept is spread across:

- conversation participation and messages in the worker
- contact/intake metadata
- practice review/triage of intakes

That means “lead” is currently a workflow concept more than a single durable object.

### Conversation

Conversation is worker-native today. It is the earliest durable user interaction object we can clearly trace in the reviewed code.

Conversation gives us:

- participant access
- messages
- websocket realtime
- linkable `conversation_id`
- a bridge into intake and later matter records

### Intake

Intake is the first clearly structured business object for a prospect in the backend. It is where we currently centralize:

- contact details
- legal context
- AI/triage context
- Stripe payment references
- practice review state

### Matter

Matter is the durable legal operations object. Once created, it becomes the center of:

- billing setup
- notes
- milestones
- tasks
- time
- expenses
- assignees
- activity history

### Payment

Payment state is attached strongly to intake today, and invoices provide the other major billing path downstream once a matter exists.

For intake-linked payments, the practical chain is:

- intake created
- Stripe payment link or checkout session created
- Stripe webhook updates payment state
- practice triages intake
- accepted + succeeded intake can convert to matter

## Gaps This Matrix Makes Obvious

| Gap | Why it matters |
| --- | --- |
| No single durable lead entity | Makes it easy to lose track of where “lead state” actually lives |
| Conversation and intake are linked, but not yet one fully automated pipeline | Handoff still depends on explicit flow steps |
| Intake-to-matter conversion exists, but is gated by payment success and triage acceptance | Good control point, but still manual in practice |
| Some intake intelligence becomes notes instead of structured matter fields | Useful today, but weaker for filtering/reporting later |
| Payment is well linked to intake, but reminder/collections behavior still needs a clearer operating model | Important for “Intercom for lawyers” product direction |

## Useful Source Files

- [worker/index.ts](../worker/index.ts)
- [conversations.ts](../worker/routes/conversations.ts)
- [practice-client-intakes.service.ts](../../blawby-backend/src/modules/practice-client-intakes/services/practice-client-intakes.service.ts)
- [practice-client-intakes.schema.ts](../../blawby-backend/src/modules/practice-client-intakes/database/schema/practice-client-intakes.schema.ts)
- [practice-client-intakes.validation.ts](../../blawby-backend/src/modules/practice-client-intakes/validations/practice-client-intakes.validation.ts)
- [matters.schema.ts](../../blawby-backend/src/modules/matters/database/schema/matters.schema.ts)
- [matters.service.ts](../../blawby-backend/src/modules/matters/services/matters.service.ts)
