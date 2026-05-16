# Contributing to Blawby AI Chatbot

Thank you for contributing! Please read this document before opening a PR.

## Code of Conduct

See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Reporting Bugs

Open a GitHub issue with:
- Steps to reproduce
- Expected vs actual behavior
- Browser, OS, and relevant logs or screenshots

## Pull Requests

1. Fork and create a branch from `main`
2. Keep changes focused on a single issue
3. Add tests for new behavior
4. Run `npm run lint` and `npm run type-check` before submitting
5. Update documentation if your change affects setup or workflows
6. Provide a clear title and description

## Development Setup

### Prerequisites

- Node.js 18+
- npm

### Install

```bash
git clone <repository-url>
cd blawby-ai-chatbot
npm install
```

### Run locally

```bash
npm run dev:full       # Uses staging backend — no local backend needed
```

Open `https://local.blawby.com`.

To test against a local backend, use `npm run dev:full:local` instead. See [CLAUDE.md](CLAUDE.md) for full instructions.

### Project structure

```
src/
  features/     # Feature modules (chat, onboarding, pricing, settings…)
  shared/       # Cross-feature components, hooks, lib, types, utils
  pages/        # Top-level route pages
  app/          # App shell, routing, guards
worker/
  routes/       # Worker route handlers
  services/     # Business logic running in the Worker
  durable-objects/
  migrations/   # D1 schema migrations
tests/
  e2e/          # Playwright end-to-end tests
  integration/  # Miniflare integration tests
  unit/         # Pure Vitest unit tests
```

### Code style

- TypeScript throughout — no `any` without justification
- ESLint + Prettier enforced via CI
- Run `npm run lint` before committing

### Design system

Use shared tokens and components — do not introduce ad-hoc styles.

- **Surfaces**: `glass-card`, `glass-panel`, `glass-input`
- **Buttons**: `<Button variant="primary|secondary|ghost|danger|…">` — do not hardcode `bg-blue-*`
- **Text**: `truncate` for single-line constrained labels; `break-words` for user content
- **Accent surfaces**: use `text-[rgb(var(--accent-foreground))]`, never `text-white` or `text-input-text`
- **Navigation**: `nav-item-active` / `nav-item-inactive` classes via shared nav state
- **Form actions**: use `<FormActions>` for cancel/submit rows
- **Debug**: `/debug/styles` shows available style primitives

### Testing

See [docs/engineering/testing-guide.md](docs/engineering/testing-guide.md).

```bash
npm run test:e2e       # Playwright E2E (primary)
npm run test:worker    # Miniflare integration
npm run test:unit      # Vitest unit
npm run test           # All non-E2E tests
```

## License

By contributing you agree your work is licensed under the project's [MIT License](LICENSE).
