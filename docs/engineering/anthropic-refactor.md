# Anthropic Claude Refactor — State of Play

> Written at the end of a multi-session refactor. Intended as onboarding for the next chat
> session. Read this top-to-bottom before touching any intake AI code.

---

## What We Changed and Why

The chatbot was using `gpt-4o-mini` via a Workers AI / OpenAI-compatible endpoint.
The goal was to switch to `claude-haiku-4-5-20251001` (Cloudflare AI Gateway, BYOK) because
Claude's instruction-following is more reliable for structured intake collection.

Five files were modified.

### 1. `worker/utils/workersAiClient.ts`

Added routing: if `model.startsWith('claude-')`, route to the Anthropic gateway endpoint
instead of the OpenAI endpoint. Uses `cf-aig-authorization: Bearer {CF_AIG_TOKEN}` and
`anthropic-version: 2023-06-01` headers. Reads `env.CF_AIG_TOKEN` for the API key.

### 2. `worker/routes/aiChatShared.ts`

Added `consumeAnthropicStream`. Anthropic SSE is structurally different from OpenAI SSE:

- Events: `content_block_start` / `content_block_delta` / `content_block_stop` / `message_delta`
- Block types tracked by numeric `index`: `text` blocks emit `text_delta`, `tool_use` blocks
  accumulate `input_json_delta`
- `stop_reason: tool_use` ends the stream when a tool is called; `stop_reason: end_turn` is
  normal text completion
- `message_delta` carries the `stop_reason`

The function returns the same shape as `consumeAiStream` so the rest of `aiChat.ts` is
unchanged.

### 3. `worker/routes/aiChatIntake.ts`

Added `toAnthropicTools` converter. Anthropic's tool format uses `{ name, description, input_schema }`
at the top level, not OpenAI's `{ type: 'function', function: { name, description, parameters } }`.

Also changed the `fieldBlock` prompt instruction (the part injected per turn telling Claude which
field to collect). The old phrasing was:

```
1. Extract and save details using save_case_details. Do this BEFORE asking anything.
2. Then ask the ONE priority question below.
```

This caused Claude to call the tool and then stop (Anthropic `stop_reason: tool_use` terminates
the stream — no text comes after). The fix inverts the order:

```
Your response this turn must do TWO things together in a single reply:
1. Write a warm conversational message: acknowledge what the client shared, then ask the
   ONE priority question below.
2. Call save_case_details to record EVERY structured detail from their message.

Always write your conversational text first, then include the save_case_details call.
```

This produces `stop_reason: end_turn` with both a text block and a tool_use block in the
same response content array.

### 4. `worker/routes/aiChat.ts`

Two fixes:

**Bug 1 — model env var ignored**: `resolveWorkersAiModel` was implemented in `workersAiClient.ts`
but never imported or called in `aiChat.ts`. The model was hardcoded to `DEFAULT_AI_MODEL`
(`gpt-4o-mini`). Fixed by importing and calling it:

```typescript
import { createWorkersAiClient, resolveWorkersAiModel } from '../utils/workersAiClient.js';
// ...
const model = resolveWorkersAiModel(env, DEFAULT_AI_MODEL);
const isAnthropicModel = model.startsWith('claude-');
```

**Bug 2 — payload format**: When `isAnthropicModel` is true, the request payload branches:
- `system` is a top-level string field (NOT a `{ role: 'system' }` message entry)
- `tools` uses `toAnthropicTools()` to convert the format
- `max_tokens: 8192` is required (Anthropic errors without it)

Stream dispatch also branches:
```typescript
const streamResult = await (isAnthropicModel ? consumeAnthropicStream : consumeAiStream)(
  aiResponse, true, streamWrite, body.conversationId, requestId, sendSseDebug,
);
```

### 5. `worker/.dev.vars` and `worker/types.ts`

`.dev.vars`:
```
AI_MODEL=claude-haiku-4-5-20251001
AI_GATEWAY_SLUG=blawby-ai
```

`types.ts`: Added `AI_GATEWAY_SLUG?: string` to the `Env` interface.

---

## Verified Working

After both fixes, wrangler logs confirm:

```
model: 'claude-haiku-4-5-20251001'
emittedToken: true
toolCallCount: 1
replyLength: ~696
wasToolOnly: false
```

Claude produces natural conversational text AND saves structured data in the same turn.

---

## Architecture: How the AI Call Flow Actually Works

This is frequently misunderstood. Here is the actual sequence:

1. **Contact form submission** — user submits name/email/phone via the widget contact form.
   This goes via WebSocket to `ChatRoom` Durable Object, which triggers an AI call to produce
   a title. It does NOT run the intake system prompt.

2. **Frontend welcome message** — `useIntakeFlow.ts:374` posts a hardcoded template string to
   `/api/conversations/{id}/system-messages` in ~15ms. This is NOT an AI response:
   ```
   "Thanks, [firstName]! I've got your contact info. Can you tell me a bit about your
   legal situation? Just describe what's going on in your own words..."
   ```
   It uses the `firstName` from the contact form, which is why it always feels instant and
   "correct" — because it is static.

3. **User messages** — every message the user types in the chat box calls `/api/ai/chat`.
   This is where Claude runs. The intake system prompt is built per-turn from:
   - `buildIntakeSystemPrompt()` in `aiChatIntake.ts`
   - Which field to ask next (`nextField`) from orchestration
   - `completenessScore` (0–100) computed deterministically from saved fields

---

## Open Issues

### 1. "Submit Request" button appears while Claude is still asking questions

**Root cause**: There are two thresholds:

| Constant | Value | Effect |
|----------|-------|--------|
| `COMPLETENESS_THRESHOLD_SHOW_CTA` | 50 | Submit button becomes visible in the UI |
| `COMPLETENESS_THRESHOLD_SUGGEST_SUBMIT` | 75 | Claude switches to synthesis/wrap-up mode |

The gap (50–74) means: submit button is visible AND Claude is still collecting enrichment fields.
This is intentional by design — the CTA is an opt-out escape hatch — but it looks wrong in
practice because it gives the impression the intake is complete when it isn't.

**Question for product**: Should the button appear only when Claude has finished asking? If so,
raise `COMPLETENESS_THRESHOLD_SHOW_CTA` to 75 (same as `SUGGEST_SUBMIT`). Or is the 50-threshold
intentional to let impatient users submit early?

The constants are in `src/shared/utils/intakeOrchestration.ts:165–171`.

### 2. Does Claude honor required vs optional field ordering?

The intake template defines fields with `required: true/false`. The orchestration in
`aiChatIntake.ts` calls `buildNextField(templateFields, storedState)` which picks the next
uncollected field. Field ordering within required vs optional phases needs verification:

- Are all required fields asked before optional/enrichment fields?
- Is there a clear phase boundary or does Claude mix them?

Look at `buildNextField` (not visible in current read window) to confirm the ordering logic.
If required fields and optional fields are mixed in one pass, that could explain why the submit
button appears before required fields are done.

### 3. `service_states` vs `supported_states` — why two fields?

The practice API returns both:
```json
{
  "service_states": ["AL"],
  "supported_states": null
}
```

Currently, `aiChatIntake.ts:996–1003` reads `service_states` and maps it to
`compact.licensedJurisdictions`, which becomes the jurisdiction guidance in the system prompt:

```
This firm is licensed in: AL (US).
Licensed jurisdiction guidance: If the matter involves a location outside (AL (US)),
acknowledge warmly without hard rejection — frame as a fit question for the attorney.
```

`supported_states` is not used anywhere in the worker. It appears to be a legacy/duplicate
field from the backend. Verify with the backend team whether `supported_states` was the old
name and `service_states` is the current authoritative field, or vice versa. If `supported_states`
is ever non-null it would silently be ignored.

### 4. `toolNames: []` in AI tool request log (low priority)

When Anthropic is used, the log line `AI tool request summary` always shows `toolNames: []`.
Root cause: the logging code extracts tool names using `.function?.name` (OpenAI format), but
Anthropic tools use `.name` directly at the top level. This is a logging bug only — no
functional impact. Fix by updating the name extraction in the summary log.

---

## Testing Guidance

### Don't use "Jordan" as a test name

The practice intro message (`intro_message` field in the practice API) uses "Jordan" as the
AI persona name. If you test with a user named "Jordan Smith", the greeting says "Hi, I'm Jordan"
and the system prompt says "The client's first name is Jordan" — impossible to tell if the AI
is referring to itself or the user.

Use a name like **Alex Carter** or **Sam Rivera** for testing.

### Use AL (Alabama) as the jurisdiction

`service_states: ["AL"]` is the configured jurisdiction for the staging test practice. If you
enter a matter located in North Carolina (or any state not AL), Claude will acknowledge the
mismatch and frame it as "a fit question for the attorney" — this is correct behavior by design.

For a clean intake test, use a matter in **Alabama** so no jurisdiction friction is introduced.

### Example test scenario

```
Name: Alex Carter
Email: alex@example.com
Phone: 205-555-0100
Legal matter: My employer in Birmingham, AL wrongfully terminated me after I filed an OSHA complaint.
              I was a warehouse supervisor for 5 years and was let go without cause last month.
```

This gives Claude: jurisdiction (AL ✓), matter type (employment/wrongful termination), timeline,
and professional role — enough to cross the completeness threshold quickly.

---

## Known Wrangler Dev Gotchas

### Stale wrangler/workerd processes

If you see WebSocket 502 errors and the AI isn't responding, check for stale worker processes:

```bash
ps aux | grep -E "wrangler|workerd"
pkill -9 -f "wrangler"
pkill -9 -f "workerd"
npm run dev:worker
```

Wrangler does not always kill previous workerd instances on restart. The Cloudflare tunnel
points to `localhost:8787` — if a new wrangler can't claim that port, it picks a random port
and all requests 502.

### Model changes don't hot-reload

After changing `AI_MODEL` in `.dev.vars` or any change to `aiChatIntake.ts`, you must manually
restart wrangler. Hot reload does not always pick up `.dev.vars` changes.

---

## Files Quick Reference

| File | Role |
|------|------|
| `worker/utils/workersAiClient.ts` | Routing: CF Workers AI vs Anthropic vs OpenAI gateway |
| `worker/routes/aiChatShared.ts` | Stream parsers: `consumeAiStream` + `consumeAnthropicStream` |
| `worker/routes/aiChatIntake.ts` | System prompt builder, tool definitions, orchestration, tool converters |
| `worker/routes/aiChat.ts` | Main intake handler: model resolution, payload build, stream dispatch |
| `src/shared/utils/intakeOrchestration.ts` | Completeness scoring, field ordering, CTA thresholds |
| `src/shared/hooks/useIntakeFlow.ts` | Frontend flow: contact form → welcome message template (NOT AI) |
| `worker/.dev.vars` | Local secrets: `AI_MODEL`, `CF_AIG_TOKEN`, `AI_GATEWAY_SLUG` |
