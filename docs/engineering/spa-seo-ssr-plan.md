# SPA-First UX with Targeted SEO/SSR (Engineering Plan)

## Goals

- Maintain app-like SPA experience (ChatGPT-like feel).
- Provide reliable SEO/social previews on key public routes.
- Keep complexity low; avoid full SSR except where necessary.

## Current State (Verified)

- SPA shell with client routing and persistent layout.
- Dynamic head updates via `SEOHead` mounted in `AppWithSEO`.
- Strong static defaults in `index.html` (title/description, canonical, OG/Twitter, JSON-LD).

## Phase 1 — SPA Polish and Baseline SEO (Now)

- Keep `SEOHead` for in-app title/description updates.
- Confirm defaults in `index.html` (already solid).
- App-like UX
  - Route-based code splitting.
  - Prefetch on intent (hover/touch) for likely routes.
  - Streaming chat responses with skeleton/optimistic UI.
- PWA basics
  - Web app manifest + icons (installable).
  - Service Worker to cache app shell and static assets.

Deliverables:
- SPA remains snappy, installable, and resilient.
- Static share previews look good site-wide.

## Phase 2 — Reliable Previews for Shareable Routes (Edge HTML)

- Identify public, shareable URLs (e.g., `/`, marketing pages, optional `/org/:id` if public).
- Implement Cloudflare Worker route(s) to serve HTML with static meta tags for those paths:
  - Fetch minimal data (org name/description/image).
  - Emit OG/Twitter tags, canonical, and safe `title/description`.
  - Return SPA shell body afterward.

Notes:
- Keep most of the app client-rendered; only meta/minimal structure are server-emitted.
- Use a stable `og:image` URL (static or worker-generated).

Deliverables:
- Deterministic social link unfurling (FB/Twitter/Slack/iMessage) for chosen routes.

## Phase 3 — Optional Enhancements

- Dynamic OG image service: Worker endpoint (e.g., `/og/:id.png`) generating branded previews.
- Incremental route coverage: add Worker meta responses for more public routes if needed.
- Monitoring: internal endpoint to dump meta for a path; track unfurl errors.

## Risks and Mitigations

- Unfurlers don’t execute JS → Serve Worker HTML for key routes.
- Increased Worker complexity → Keep responses minimal; avoid full SSR/hydration.
- Caching → Short TTL + ETag for Worker HTML/meta; revalidate on content changes.

## Acceptance Criteria

- Phase 1
  - In-app navigation updates `document.title` and `description`.
  - Lighthouse PWA checks pass (installable; SW active).
  - Static share preview for `/` shows correct image/title/description.
- Phase 2
  - Sharing a key route consistently shows expected preview across Facebook/Twitter/Slack.
  - No regressions to SPA performance or navigation.

## Implementation Checklist

- Now
  - Ensure `SEOHead` stays mounted globally.
  - Verify code splitting and prefetch settings.
  - Confirm manifest + SW presence (add if missing).
- Next
  - Choose 1–2 shareable routes.
  - Add Worker route to return HTML with OG/Twitter tags for those paths.
  - Point `og:image` to a stable asset or generated image.
- Later
  - Add dynamic OG image generation (optional).
  - Expand Worker meta to additional routes if marketing requires it.
