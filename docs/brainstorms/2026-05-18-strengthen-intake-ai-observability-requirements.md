---
date: 2026-05-18
topic: strengthen-intake-ai-observability
---

# Strengthen Intake AI — Loud & Inspectable

## Summary

Fix the public-widget intake bug where the AI never fires, purge the silent regex fallbacks that masked the failure, and stand up the persistence + admin view that makes every intake conversation post-hoc inspectable. Hard-error on AI failure with a partial-intake submit so leads aren't lost. Conversational-quality work (slot inference, custom-template runtime parity, Typeform-direction polish) is named and deferred; this iteration buys the observability substrate those iterations will need.

Tracks issue: [#596](https://github.com/Blawby/blawby-ai-chatbot/issues/596).

---

## Problem Frame

The public intake widget (`/public/{org}?template=default`) is the product's front door for legal leads. A practice publishes it; a lead clicks "request consultation"; the lead expects a conversational AI to walk them through their case. The product's positioning ("AI for legal practices") rests on that conversation feeling intelligent.

Today it doesn't. The AI never fires. Mode resolution in `worker/routes/aiChat.ts:465-469` gates intake-AI activation on `effectiveMode === 'REQUEST_CONSULTATION'` (or three fallback signals), and the widget bootstrap never sets that mode for a fresh session. The conversation routes to "general QA mode" with a generic operational prompt and no intake tools. The model returns generic text; a parallel set of regex shortcuts (`aiChat.ts:520-540`) intercepts hours / legal-advice / services questions with hard-coded replies before any model call happens. The end-user experience is a rigid, scripted exchange that asks for `state` even when the user just said "Charlotte, NC".

The compounding cost is that this bug has been silently routing intakes for an unknown period. The current `Logger` calls do not warn when `isIntakeMode` resolves false, so the silent-routing-to-QA is invisible in logs. There is no per-turn intake telemetry, no inspectable admin view, no record of which intakes degraded and why. The next AI intake bug will survive equally long unless the debug substrate exists.

Intake conversation state today lives in `conversations.user_info` as a JSON blob (no dedicated table; verified via `worker/services/ConversationService.ts`). There is no per-turn record of the model request, the model response, the tool calls, the tool results, or which fallback (if any) fired. "Strengthening intake" without first building that record is fixing in the dark.

---

## Actors

- A1. Public widget user (legal lead): Opens the widget, fills slim contact form (name, email, phone), expects a conversational intake to follow. Has one session, no second chance.
- A2. Practice owner: Receives intakes via dashboard. In v1, degraded intakes appear alongside normal ones with no visual distinction (R15 dropped — see Key Decisions); practice-owner-visible flagging is queued for a follow-up iteration.
- A3. Blawby internal engineer: Diagnoses AI intake failures across practices; needs per-turn inspection of any intake conversation to identify regressions in prompts, tools, or mode resolution.
- A4. Intake AI runtime: Server-side agent in `worker/routes/aiChat.ts` that resolves mode, builds the tool schema from the active template, calls the model, executes tool calls, persists state.
- A5. Backend `submit-intake` API (separate repo `blawby-backend`): `POST /create` on the practice-client-intakes module. Anonymous, accepts the four required fields (`slug`, `amount`, `email`, `name`) and any optional fields; unknown fields silently stripped. Contract verified during this brainstorm; no backend changes required for v1.

---

## Key Flows

- F1. Successful intake on default template
  - **Trigger:** A1 opens `/public/{org}?template=default`, completes the slim contact form, sends a first conversational message.
  - **Actors:** A1, A4
  - **Steps:** widget bootstrap resolves the practice and template; mode is set such that intake-AI activates; A4 receives the intake system prompt and tool schema generated from the default template; for each user turn, A4 calls the model with the conversation + tools; tool calls are executed and intake state is merged; when all required fields are collected, A4 calls `submit_intake`.
  - **Outcome:** Backend receives a complete intake; practice sees a normal (non-flagged) intake in the dashboard; conversation timeline shows every turn provenance-tagged as `ai_intake`.
  - **Covered by:** R1, R2, R7, R8, R9
- F2. AI fails mid-intake
  - **Trigger:** During an active intake, A4 hits an upstream AI failure (HTTP error, malformed tool call after retries, tool execution exception) or the model returns nothing actionable.
  - **Actors:** A1, A4, A5
  - **Steps:** A4 stops attempting to recover after a bounded retry; the widget renders a hard error to A1 ("Our intake assistant is having trouble right now — we've passed what you've told us so far to the practice and they'll reach out."); A4 posts a partial-intake payload to A5 with the four required fields, any optional fields collected so far, the `conversation_id` linking to the event timeline, and a `failure_context` block (silently stripped by current backend, recoverable from timeline via conversation_id).
  - **Outcome:** A2 sees the intake in the dashboard as a normal `pending_review` intake (no v1 visual distinction — see R15 drop in Key Decisions); the event timeline shows the failure turn provenance-tagged as `ai_failure`, recoverable by A3 via the conversation id.
  - **Covered by:** R13, R14
- F3. Engineer inspects an intake post-hoc
  - **Trigger:** A3 needs to debug a specific intake (reported by a practice, or surfaced by a monitoring query).
  - **Actors:** A3
  - **Steps:** A3 opens the admin intake-inspection view for a conversation id; the view renders every turn in order with provenance badges (`ai_intake`, `safety_rail.legal_disclaimer`, `ai_failure`, `submit_intake`, etc.); for each AI turn, A3 can expand to see the model request payload, raw response, tool calls, tool results, and mode-resolution trace.
  - **Outcome:** A3 can identify which turn degraded and why without grepping production logs.
  - **Covered by:** R7, R8, R9, R10, R11, R12

---

## Requirements

**Mode wiring fix (foundational)**
- R1. Intake-AI mode resolution on the public widget path must reliably activate intake mode for any fresh session that originated from a "request consultation" flow, without requiring the client to remember to send a mode parameter on every message. The source-of-truth signal lives where the session originates (widget bootstrap or first message), not in the message body of every subsequent turn.
- R2. When intake mode resolves false on a public widget conversation, the runtime must emit a structured warning identifying which condition branch failed (e.g., `intake.mode.unresolved` with `effectiveMode`, `consultation_present`, `slim_contact_present`, `intake_brief_active` flags). Silent routing to non-intake mode on the public widget path is treated as a defect, not a normal branch.

**Fallback purge and safety-rail distinction**
- R3. The hours-question and services-question regex shortcuts in `aiChat.ts:520-540` are removed. These questions are answered by the AI (which has access to practice details) or by the structured "I don't have that information, please contact the practice" path — not by pre-emptive regex match.
- R4. The legal-advice regex shortcut that returns `LEGAL_DISCLAIMER` is **kept** but re-classified explicitly as a safety rail, not a fallback. It must be loud in the event timeline (provenance `safety_rail.legal_disclaimer`) and must be triggered through the same logged path as any other turn (no silent bypass of telemetry).
- R5. The non-intake-mode system prompt path (`aiChat.ts:706` `else if (!isIntakeMode)`) is removed for the public widget intake route. On that route there is no non-intake mode — if intake mode hasn't activated, that is the bug from R1/R2, not a branch to fall back into.
- R6. Onboarding mode (`isOnboardingMode`) is preserved as a distinct, non-public-widget code path and is unaffected by R5.

**Event timeline persistence**
- R7. Every intake conversation turn writes one record to a new persistence layer (the "intake event timeline"). A turn includes: inbound user message (when applicable), resolved mode and which-branch-fired, model request payload (system prompt, tools, messages), model raw response, tool calls and their arguments, tool execution results, and a typed `provenance` tag.
- R8. Provenance tags are a closed enum at the schema level, including at minimum: `ai_intake`, `ai_intake_no_tool_call`, `safety_rail.legal_disclaimer`, `ai_failure`, `submit_intake`. New provenance values require a schema change, not a free-text addition — the closed enum is what makes "loud" verifiable.
- R9. Event-timeline records are append-only per turn. Edits to historical turns are not supported. State merges (which combine multiple turns into the current intake state) live in their existing location (`conversations.user_info`) and are not duplicated into the event timeline.

**Admin inspection view**
- R10. An admin view (audience: Blawby internal engineers in v1; practice-owner exposure deferred — see Key Decisions and Scope Boundaries) accepts a conversation id and renders the full event timeline for that intake in order.
- R11. For each AI turn in the rendered timeline, the engineer can expand the turn to see the full model request payload, raw response, tool calls, tool results, and mode-resolution trace.
- R12. The view distinguishes successful AI turns, safety-rail turns, and AI-failure turns visually (badge or color) without requiring the engineer to read the provenance string.

**Failure UX and partial-intake submit**
- R13. When the intake AI fails (upstream HTTP error, unparseable model response after one retry, or tool execution exception), the widget must render a hard error to the user — no scripted-pretending-to-be-AI continuation. The error message must (a) be honest about the failure, (b) tell the user that what they've already shared has been passed to the practice, and (c) not invite the user to retry the same broken flow.
- R14. On AI failure, the runtime posts a partial-intake payload to backend `POST /create` (practice-client-intakes module) with at minimum the four required fields (`slug`, `amount`, `email`, `name`) plus any optional fields already collected. The failure context (reason category, mode-resolution trace, last user message, event-timeline reference) is included on the request, even though the v1 backend has no first-class field for it — it will be silently stripped by the backend schema today. The full context is recoverable from the event timeline via the `conversation_id` field (which IS accepted by the backend schema and links the dropped failure context back to the inspectable record).

---

## Acceptance Examples

- AE1. **Covers R1, R2.** Given a public widget session on `/public/{org}?template=default` where the user has just completed the slim contact form and sent the first conversational message, when the worker handles that message, then intake mode is active for the rest of the conversation without requiring the message body to carry `mode: 'REQUEST_CONSULTATION'`. If intake mode does not activate, an `intake.mode.unresolved` warning is logged for that conversation id.
- AE2. **Covers R3.** Given a public widget intake conversation where the user asks "what are your hours?", when the worker handles that message, then the AI is called with the intake system prompt and may answer using practice-details context — no pre-emptive regex shortcut intercepts the message. The turn is recorded with provenance `ai_intake`.
- AE3. **Covers R4.** Given a public widget intake conversation where the user asks "do I have a case?" or any phrase matching the legal-advice regex, when the worker handles that message, then the `LEGAL_DISCLAIMER` response is returned AND a turn is recorded with provenance `safety_rail.legal_disclaimer` in the event timeline.
- AE4. **Covers R10, R11.** Given a completed intake conversation with conversation id `C`, when an internal engineer opens the admin inspection view for `C`, then they see every turn in chronological order with provenance badges, and they can expand any AI turn to see model request, raw response, tool calls, tool results, and mode-resolution trace without leaving the view.
- AE5. **Covers R13, R14.** Given a public widget intake conversation where the AI upstream returns a non-recoverable error mid-conversation, when the failure is detected, then (a) the widget renders the hard-error message and disables further input, (b) backend `POST /create` receives a payload with the four required fields plus the `conversation_id` linking back to the event timeline, and (c) an engineer can open the inspection view for that conversation id and see the failure turn with full context. The practice dashboard does NOT distinguish this intake from a normal one in v1 (see Scope Boundaries).
- AE6. **Covers R5, R6.** Given an onboarding session (not a public widget intake), when the worker handles a message, then the onboarding system prompt path still applies — the non-intake-mode removal in R5 must not break the onboarding flow.

---

## Success Criteria

- A Blawby engineer can open the admin inspection view for any intake conversation and identify, without grepping production logs, which turn degraded and why. Without this, the next intake bug survives months again.
- Zero silent fallbacks in production: every regex shortcut path that remains (only `LEGAL_DISCLAIMER`) is loud in the event timeline. Removed shortcuts are gone from the code (verifiable by grep). Mode-unresolved on the public widget path is logged.
- On `/public/{org}?template=default`, the AI fires on the first conversational turn — verifiable by an end-to-end test that sends one message and asserts that a model request was issued and a tool call was attempted.
- On AI failure, no public widget lead is silently dropped: a partial intake reaches the backend with contact data + `conversation_id`, recoverable in full by an engineer via the inspection view. Verifiable by an end-to-end test that injects an upstream AI failure and asserts the backend received the partial payload and that the conversation id resolves to a full event-timeline record with an `ai_failure`-tagged turn. (Practice-owner-visible flagging is deferred — see Scope Boundaries.)
- A downstream agent or implementer reading the requirements doc can pick a single R-ID, locate the relevant code path, and ship the requirement without re-asking what success looks like — i.e., the doc is complete enough to start ce-plan.

---

## Scope Boundaries

- **Practice-dashboard flagging of degraded intakes is out** (was R15; dropped in scoping). Backend `practice_client_intakes` schema has no `submission_quality` / `failure_context` field today, and the dashboard has no UI to render one. Adding both is deferred to a follow-up iteration. v1 outcome: degraded intakes still reach the practice via `POST /create` (no lead loss), but they appear as normal `pending_review` intakes; only the engineer inspection view distinguishes them.
- Slot inference / multi-field utterance parsing ("Charlotte, NC" → city + state in one turn) is **out**. The default template's separate city/state fields will continue to be asked separately until a follow-up iteration. This observability iteration will make the bad UX visible in the timeline; fixing it is the next iteration's job.
- Custom-template runtime parity (dynamic per-template AI tool schemas, conditional field logic, branching) is **out**. The Question Builder authoring surface already exists; the runtime's treatment of non-default templates is a separate brainstorm.
- Typeform-direction visual polish (motion, copy, layout work on the widget itself) is **out**.
- Replay-against-current-config (Approach C from the brainstorm: re-fire a stored intake turn against the current model + prompt to verify a fix) is **out** for v1. Queued as a follow-up once the event timeline ships and PII / sandboxing have been thought through.
- Practice-owner exposure of the admin inspection view is **out** for v1; engineer-only audience to start (see Outstanding Questions).
- Automatic retention / deletion of stored model payloads is **out** for v1 — retention is indefinite by decision; per-record manual deletion (at the conversation-id grain) must be operationally possible. Building automated retention policies, GDPR-style deletion-on-request flows, or jurisdiction-specific retention rules is deferred to a later iteration.

---

## Key Decisions

- **Persisted event timeline (Approach A) over conversation-as-truth-with-provenance (Approach B)**: keeps diagnostic data out of the customer-facing conversation row, makes the fallback-vs-safety-rail distinction explicit at the schema level, and avoids JSON-scan-shaped queries on the conversation table. Trade-off: introduces a parallel storage layer that must be kept in sync conceptually with `conversations.user_info`; mitigated by R9 (timeline is append-only, state lives in one place).
- **Replay deferred, not adopted**: Approach C's replay-against-current-config is the higher-upside affordance and is queued as the next iteration, not folded into v1. Rationale: requires PII / sandboxing thinking that would expand v1 scope materially.
- **Hard error + partial intake submit on AI failure**, instead of (a) silent scripted degradation, (b) blocking intake entirely, or (c) plain-form fallback. Honors the CLAUDE.md "fix the API, do not mask failures" rule for the developer-facing concern AND preserves the lead-capture business outcome via the existing slim-form contact data.
- **`LEGAL_DISCLAIMER` is kept as a safety rail, not deleted as a fallback**. Removing it could mean the AI improvises legal advice — unacceptable liability surface for "AI for legal practices". Reclassified explicitly so the rule "no silent fallbacks" doesn't accidentally delete a safety feature.
- **Mode source-of-truth lives at session origin, not per-message**. R1 deliberately doesn't prescribe whether mode is stored on `conversations` (DB) or inferred from `widget_bootstrap` context every turn — that's a planning decision. The product decision is: the client shouldn't have to remember to send mode on every message.
- **R15 (dashboard flagging of degraded intakes) is dropped from v1.** Engineer inspection view is the only v1 surface where degradation is visible. Rationale: backend `practice_client_intakes` schema has no first-class field for submission quality, dashboard has no UI to render one, and adding both would expand v1 into a cross-repo PR. v1 still posts partial intakes to backend `POST /create` (so no lead is lost), they just appear as normal `pending_review` intakes to the practice owner. Dashboard flagging is queued as a follow-up iteration with the backend changes.
- **`conversation_id` is the link between worker event timeline and backend intake records.** The backend schema accepts `conversation_id` (uuid, optional). Worker sets it on every submit, including partial submits. Even though the backend silently strips the `failure_context` payload today, an engineer with a flagged intake's `conversation_id` can open the event timeline and see everything. This is what makes dropping R15 acceptable for v1 without losing diagnostic capability.
- **Admin inspection view audience in v1: Blawby engineers only**. Internal-only route, raw payloads acceptable, no per-practice auth scoping, minimal polish. Practice-owner exposure becomes a separate iteration after the view stabilizes. Rationale: ship the debug substrate fast for the team that needs it most (engineers diagnosing AI failures); avoid v1 expansion into auth-scoping + curated-presentation work that would delay the observability win.
- **Retention for full intake event records: indefinite, manual cleanup only**. No automatic deletion of model request/response payloads. Maximum debug power, with deletion handled per-request (engineer or compliance trigger). Trade-off accepted: PII surface grows over time, and future compliance work (e.g., GDPR-style deletion-on-request, jurisdiction-specific retention requirements) will need a manual access pattern. Planning should ensure deletion is possible at the conversation-id grain so per-record cleanup is operationally feasible.

---

## Dependencies / Assumptions

- **Backend `submit-intake` API contract** (repo: `blawby-backend`): verified during this brainstorm. Endpoint is `POST /create` in `src/modules/practice-client-intakes/`. Required fields: `slug`, `amount`, `email`, `name`. All other intake fields (description, urgency, desired_outcome, court_date, has_documents, household_size, custom_fields, address, etc.) are optional. Unknown fields are silently stripped (no `.strict()`). Anonymous submission allowed (no auth). `conversation_id` (uuid) is an accepted optional field. There is NO existing `submission_quality` / `failure_context` field on the schema; the worker will include failure context on the request payload anyway (silently stripped today; recoverable from event timeline via `conversation_id`).
- **Slim contact form already captures name + email + phone before the AI conversation begins**: verified via the existing `hasSlimContactDraft` signal in `worker/routes/aiChat.ts`. The partial-intake submit on failure (R14) depends on this.
- **`Logger` infrastructure in `worker/utils/logger.ts` supports structured fields** at the level R2 needs: verified; existing calls like `Logger.info('ai.tool.raw', { ... })` show the pattern works.
- **D1 (Cloudflare) is the appropriate persistence layer for the event timeline**: assumed but not yet decided — could alternatively live in the backend (Railway) as part of the intake record. Flagged as a Deferred-to-Planning question.
- **Public widget origin signal is reliable**: `isPublic` is already used as an intake-mode gate in `aiChat.ts:465-469`; R1 will reuse it. Verified.

---

## Outstanding Questions

### Resolve Before Planning

_None. All product decisions resolved during the brainstorm._

### Deferred to Planning

- [Affects R1][Technical] Where mode signal is persisted (DB column on `conversations`, in-memory derivation from widget bootstrap context per turn, or a third option). Resolve during planning by reading the relevant `worker/routes/widget.ts` and `worker/routes/aiChat.ts` paths and choosing the least-coupling option.
- [Affects R7][Technical] Persistence target for the event timeline: new D1 table in the worker repo, vs. extending the existing backend `intakes` model. Resolve during planning with awareness of cross-repo coupling and query patterns.
- [Affects R7, R8][Needs research] Schema for the event timeline record: exact column set, indexes (conversation id, provenance type, timestamp), partition / cleanup strategy. Resolve during planning.
- [Affects R3][Technical] How the AI surfaces practice details (hours, services) once the regex shortcuts are removed — is the existing system prompt context sufficient, or does the tool schema need a `lookup_practice_detail` tool? Resolve during planning by reading the current intake system prompt and tool definitions.
- [Affects R10, R11][Needs research] Existing internal admin surface vs. building net new. The repo already has practice-facing pages and a `Conversations` view; engineers may have an internal route already. Resolve during planning by surveying what exists.
- [Affects R13][Technical] What constitutes "AI failure" for the purposes of triggering the hard-error UX (retry policy, error categories, idempotency on partial submit if user re-sends). Resolve during planning.
