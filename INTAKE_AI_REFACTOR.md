# AI Intake Refactor — Status & Roadmap

## The Vision

Replace the current "form with AI frosting" with a genuinely conversational intake experience — the way a skilled legal receptionist actually works on the phone. The model is Typeform-style conversational flow, not a field list the AI reads out loud.

**What a good legal receptionist does:**
1. Opens with one open question and actually listens
2. Extracts everything they can from what the caller volunteered
3. Asks only about gaps that matter *for this case type*
4. Explains why when a question might seem odd ("How many in your household? This affects fee eligibility")
5. Signals readiness naturally — "I think we have enough to get you in front of an attorney"
6. Never asks for something already given

**Core architectural principle: extract-first, ask-second.** The AI saves everything volunteered in every turn via `save_case_details` before deciding what to ask next. The worker computes a completeness score after every turn; the conversation adapts to that score rather than advancing through a fixed field queue.

**Question types, not intake templates.** Blawby owns the *question type primitives* (the building blocks with AI-safe prompting behavior), not full practice-area templates. A practice building their form picks from: Text, Yes/No, Date, Choose one, Choose many, File upload. They configure the label, the AI instruction, the conditions. Blawby's job is to make each type work reliably in conversation. Blawby-verified starter templates (family law, landlord dispute, etc.) are curated starting points built from the same primitives — not special-cased code paths.

---

## Current State (after PR #686)

Branch: `refactor/conversational-intake` → PR to `staging`

### What is done

| Area | Change |
|------|--------|
| **Architecture** | Collapsed two-phase model (required → Strengthen button → enrichment) into one adaptive conversation |
| **Score-based CTA** | `computeCompletenessScore` (0–100) drives submit visibility at ≥ 50, AI synthesis at ≥ 75 |
| **Unified prompt** | `buildIntakeSystemPrompt(nextField, completenessScore)` — single prompt, no `isEnrichmentMode` binary |
| **Extract-first instruction** | Prompt explicitly instructs AI to call `save_case_details` with everything volunteered before asking the next question |
| **Strengthen removed** | `strengthen_case` action, `enrichmentMode` state, fake message injection, `_handleStrengthenCase`, and the Strengthen button are gone from every layer |
| **Field weights** | Every `STANDARD_FIELD_DEFINITION` has `completenessWeight` (description=25, urgency=12, opposingParty=12, desiredOutcome=12, courtDate=10, city=8, state=7, practiceServiceUuid=8, hasDocuments=6, householdSize=0) |
| **promptHint on all standard fields** | Every field has a natural-language AI instruction for how to ask it, when to skip it, and what to extract |
| **householdSize excluded from score** | `completenessWeight: 0` — never drives CTA; promptHint instructs AI to only ask when clearly relevant |
| **Form builder** | "AI instruction" label (was "Helper text"), 500-char limit — practices can write `promptHint` for custom fields |
| **Answer type selector** | Functional dropdown (Text / Yes-No / Date / Number / Choose one / Email / Phone / Choose multiple) with backend types natively preserved |
| **Options editor** | Inline add/remove for `select` type custom fields |
| **Validation hint** | Editable per field (stored as `help_text`); type-aware placeholder guides practices |
| **condition (skip logic)** | `FieldCondition` is editable in the inspector ("Only ask when" picker) and serialized to `validation_rules` JSON |
| **completenessWeight** | 0–25 slider for custom fields serialized to `validation_rules.completeness_weight` |
| **Backend sync** | Fixed API normalizer to handle correct backend response shape `{ template: ... }` / `{ templates: ... }` |
| **AI prompt accuracy** | Custom fields are resolved by `label` instead of raw backend `key` in the AI `buildIntakeContextSummary` block |
| **Custom template bootstrap** | Widget bootstrap now honors `?template=<slug>` and, using `MCP_BACKEND_TOKEN`, fetches that published template from the admin templates API so public custom forms can route without backend changes |
| **Public link + embed flow** | Publishing a template opens `EmbedCodeDialog` immediately with the direct public URL (`/public/{slug}?template={templateSlug}`) and widget embed snippet ready to copy |
| **Types cleaned** | `enrichmentMode` removed from `IntakeConversationState`, `IntakeFieldsPayload`, `PERSISTED_INTAKE_FIELD_KEYS`, `consultationState`, `useChatComposer` |
| **E2E tests updated** | Removed strengthen-case test; new test: score-threshold CTA + "Strengthen" button must not appear |

### What is NOT verified

- **Multi-field extraction in practice**: The prompt instructs it, but we have not run the E2E suite against the new prompt to confirm the AI consistently extracts multiple fields from a single rich answer. Run `npm run test:e2e` and check the SSE payload attachments for `intakeFields` breadth.
- **householdSize skipping**: The promptHint says "only ask when relevant" but this is AI-discretion only — the worker does not structurally exclude it. Needs a real conversation test with a business dispute to verify the AI skips it.
- **Synthesis turn quality**: Score ≥ 75 triggers the synthesis system prompt, but we have not manually verified the AI produces a natural case summary + invite-to-submit rather than a mechanical list.
- **condition / completenessWeight persistence**: Both are serialised into `validation_rules` JSON in the save payload and read back via `normalizeField`. Whether the staging-api backend accepts and round-trips `validation_rules` in PUT requests needs verification — if the backend ignores it, fields work in-session but don't persist after reload.

### E2E status right now

- **Public-mode default widget coverage is green**: `tests/e2e/widget-intake-ai-fires.spec.ts` passes in the public Playwright lane and confirms the default public intake flow still reaches `/api/ai/chat` and returns SSE.
- **Public-mode custom-template coverage is live**: `tests/e2e/intake-form-templates.spec.ts` creates a real template via the owner API, opens the public widget with `?template={slug}`, and asserts that the worker resolved the correct template from the backend via `?template_slug=` — no bootstrap stub, no MCP token.
- **Backend PR #328 merged** (2026-06-11): `?template_slug=` query param is live on staging. E2E test should pass end-to-end once staging is redeployed.

---

## What Still Needs to Be Done

### 1. Custom template routing + field metadata bootstrap ✅ done

**What's implemented:**
- Backend `GET /api/practice-client-intakes/{slug}/intake` accepts optional `?template_slug=` query param — returns the matching published template for the practice, falls back to the practice default when omitted or not found
- Widget bootstrap reads `?template=<slug>` from the public URL and passes it as `template_slug` to the public intake settings endpoint — no MCP token, no authenticated admin API
- `useWidgetBootstrap` forwards the `?template=` query param to the worker bootstrap endpoint
- The builder now surfaces the public link/share flow immediately after publish via `EmbedCodeDialog`
- `getPublicFormUrl` generates direct links in the form `/public/{practiceSlug}?template={templateSlug}`

**Why this matters:**
- Custom published intake forms can be shared directly via public URL without any authenticated API calls in the widget bootstrap flow
- No `MCP_BACKEND_TOKEN` required for template selection

### 2. Service-aware field conditions ✅ foundation done

**What's implemented:**
- Form builder condition editor shows a service name picker (not UUID text input) when `dependsOn === 'practiceServiceUuid'` — values stored as UUIDs, displayed as names from `currentPractice.services`
- Widget bootstrap reads `?service=<uuid>` from the embed URL → included as `preSelectedServiceUuid` in bootstrap response
- `WidgetApp` seeds `intakeConversationState.practiceServiceUuid` when creating a conversation — so `resolveNextField` evaluates field conditions correctly from turn 1 without waiting for the AI to detect the service
- `BackendIntakeTemplatePublic` now includes `validation_rules` (was omitted) — custom field conditions and completeness weights now reach the widget bootstrap
- Widget bootstrap normalizer now reads `validation_rules` and `help_text` from template fields

**Remaining (needs backend work only if we want backend-native routing):**
- The public intake API (`GET /api/practice-client-intakes/{slug}/intake`) still always returns the single default published template. If we want backend-native service/template routing instead of the worker override, that endpoint needs to support template selection.

### 3. `validationHint` wired end-to-end ✅ done (form builder)

Practices can now write a validation hint per custom field in the form builder — stored as `help_text`, read back in `normalizeField` as `validationHint`. The field editor placeholder adapts to the selected answer type (e.g. "e.g. Any date format — AI converts to ISO" for date fields).

**Still needed:** Populate `validationHint` for all standard fields in `STANDARD_FIELD_DEFINITIONS` and include it in the `buildIntakeSystemPrompt` field instruction block so the AI knows what a valid answer looks like for each standard field.



### 4. Type-safe AI behavior per field type ✅ prompt + runtime guardrails implemented

**What's implemented:**
- `buildIntakeSystemPrompt` now injects explicit type-specific instructions for `select`, `multiselect`, `date`, `boolean`, and `number` fields instead of relying on generic `promptHint` wording alone
- `buildFieldInstructions` now includes the same type rules so full-template context reflects the valid answer shape, not just the next-field block
- `buildSaveCaseDetailsTool` now describes `multiselect` fields as exact-option, comma-separated values rather than plain free text
- `handleSaveCaseDetails` now validates custom field values against the active template before persisting them:
  - invalid custom `select` values are dropped
  - invalid custom `date` values that are not `YYYY-MM-DD` are dropped
  - invalid custom `multiselect` values are dropped unless every selected option is exact-match valid
  - valid custom `multiselect` values are normalized into a comma-separated string of exact option labels

**Still needed:**
- Live end-to-end verification in the public widget using a real saved custom template once backend create/publish is fixed
- Decide whether `multiselect` should remain stored as a comma-separated string in `customFields` or get first-class array support in the backend contract later

### 5. Blawby-verified starter templates

**Problem:** No curated starting points for common practice types. Practices currently start from an empty field list or the default template.

**Solution:** Build 3–5 starter templates (e.g. Family Law, Landlord/Tenant, Criminal Defense, Business Dispute) from `STANDARD_FIELD_DEFINITIONS` + relevant custom fields, pre-configured with `relevantFor`, `promptHint`, `condition`, and `completenessWeight`. These are not special-cased — they use the same `IntakeFieldDefinition` primitives as custom practice forms.

### 6. Convert stubbed public custom-template E2E to live builder flow ✅ done

**What's implemented:**
- `tests/e2e/intake-form-templates.spec.ts` creates and publishes a real template via `POST /api/practice/{practiceId}/intake-templates` using owner credentials, then opens the public widget with `?template={slug}`
- Worker passes `?template_slug=` to the public intake settings endpoint — no MCP token, no admin API
- Asserts `bootstrapPayload.intakeTemplate.slug` equals the slug we created (proves the worker resolved the right template, not the practice default)
- Asserts the conversation create payload embeds the correct template with all structured field types: `select`, `date`, `boolean`, `number`
- Cleans up (deletes the template) in a `finally` block
- Skips gracefully when `E2E_PRACTICE_ID`/`E2E_OWNER_EMAIL` credentials are not configured
- AI chat response remains stubbed for determinism
- **Backend PR #328 merged** 2026-06-11 — unblocked once staging redeploys

---

## Key Files

| File | Role |
|------|------|
| `src/shared/types/intake.ts` | `IntakeFieldDefinition` shape — add `relevantFor` here |
| `src/shared/constants/intakeTemplates.ts` | `STANDARD_FIELD_DEFINITIONS` — canonical field list, weights, hints |
| `src/shared/utils/intakeOrchestration.ts` | `computeCompletenessScore`, `resolveNextField`, thresholds |
| `worker/routes/aiChatIntake.ts` | `buildIntakeSystemPrompt` — the AI's behavioral contract |
| `worker/routes/aiChat.ts` | Orchestration: calls resolveNextField, computes score, builds gate |
| `src/features/intake/pages/IntakeTemplatesPage.tsx` | Form builder UI — field editor, skip logic, weight |
| `tests/e2e/widget-intake-flow.spec.ts` | E2E tests — run and check SSE payload attachments to verify extraction breadth |

## Score Thresholds

```
COMPLETENESS_THRESHOLD_SHOW_CTA     = 50   // Submit button appears
COMPLETENESS_THRESHOLD_SUGGEST_SUBMIT = 75  // AI synthesizes + invites submission
```

Description alone = 25 pts. Description + city + state = 40 pts (no submit yet). Add urgency or opposingParty → 52 pts → submit appears. Adding desiredOutcome + courtDate → 74 pts. One more field → synthesis turn.

---

## What "Done" Looks Like

The refactor is complete when a real conversation with the widget — for a landlord dispute, a divorce, and a DUI — reads the way a skilled legal receptionist would handle each call: the AI adapts its questions to what it already knows, never asks for something given, explains why when a question might seem odd, and invites submission at the right moment without a button or a mode switch. The form builder lets any practice replicate that quality for their own custom questions.
