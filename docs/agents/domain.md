# Domain docs

This repository uses a single-context domain-doc layout.

## Before exploring

Read these sources when they exist and are relevant:

- `CONTEXT.md` at the repository root for domain terminology.
- ADRs under `docs/adr/` for past architectural decisions.

If either source does not exist, proceed silently. The `grill-with-docs` skill
creates domain documentation lazily as terminology and decisions become clear.

## Vocabulary

Use terminology defined in `CONTEXT.md` in issue titles, proposals, hypotheses,
and test names. Avoid synonyms that its glossary explicitly rejects.

If a needed concept is missing, reconsider whether the term belongs to the
project or note the gap for a future `grill-with-docs` session.

## ADR conflicts

Explicitly identify when proposed work conflicts with an existing ADR instead
of silently overriding the recorded decision.
