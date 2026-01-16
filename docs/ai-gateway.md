# Cloudflare AI Gateway Configuration

## Required environment variables

Non-secret config (managed in `worker/wrangler.toml`):

- `CLOUDFLARE_ACCOUNT_ID`
- `CF_AIG_GATEWAY_NAME`
- `AI_PROVIDER` (optional: `cloudflare_gateway` or `openai_direct`)

Secrets (set via Wrangler or local `.dev.vars`):

- `CF_AIG_TOKEN` (Cloudflare AI Gateway auth token)
- `OPENAI_TOKEN` (OpenAI-compatible token forwarded to the provider)

## Wrangler secrets

For Workers, set secrets with Wrangler:

```bash
wrangler secret put CF_AIG_TOKEN --config worker/wrangler.toml
wrangler secret put OPENAI_TOKEN --config worker/wrangler.toml
```

For local development, copy `dev.vars.example` to `worker/.dev.vars` (same directory as `worker/wrangler.toml`) and fill in your values.

## Gateway URL format

The AI Gateway base URL is constructed as:

```text
https://gateway.ai.cloudflare.com/v1/${CLOUDFLARE_ACCOUNT_ID}/${CF_AIG_GATEWAY_NAME}/openai
```

Chat completions are sent to:

```text
${baseUrl}/chat/completions
```

## Smoke test

Run the smoke test to verify the configuration (no secrets are printed):

```bash
npm run smoke:ai-gateway
```

The script logs the HTTP status and a truncated response preview, and exits non-zero if required environment variables are missing or if the request fails.
