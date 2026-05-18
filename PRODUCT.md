# Product

## Register

product

## Users

**Primary: solo practitioners, small-firm partners, and legal-ops staff at law firms.**
They use Blawby during a working day, often with multiple matters open at once, switching between client conversations, intake review, invoices, and matter notes. Their job is to move work forward — answer a client, generate a draft, approve an intake, send a payment request — in the smallest number of steps. They are experts at law and impatient with tooling; every extra click costs trust.

**Secondary: clients seeking legal help**, encountered via the conversational intake widget and a read-only client portal. They are nervous, mobile-first, and may not return. Their job is to describe their situation and get an answer back. They are not the paying customer; they are users-by-proxy, and the design optimizes for the practice first.

## Product Purpose

Blawby is an AI-assisted legal-practice tool. It replaces the patchwork of intake forms, email threads, document scanning, billing tools, and admin chrome that small firms currently stitch together. The product earns its keep by collapsing routine work — intake, drafting, matter tracking, invoicing — into a single fast surface, so lawyers spend more time on judgment and less on coordination.

Success looks like a lawyer opening Blawby in the morning, working through their queue with keyboard and confidence, and closing it fifteen minutes earlier than the day before.

## Brand Personality

Composed, precise, quietly editorial. Three words: **sharp, calm, accountable.**

Reference point: **Stripe Dashboard.** Light-first by default. Information-dense without being cramped. Comfortable showing money, numbers, and tables without dressing them up. Type does work, not decoration. Trustworthy more than cool.

Voice is plain English. We respect the reader's time and intelligence. We do not perform expertise; we deliver it. We do not bury the answer; we lead with it. Warmth appears only when it earns its place — error recovery, empty states, first-run — never decoratively.

Emotional goal: the surface feels like a competent associate who has already read the file. Information is where you reach for it. Decisions are obvious. The tool gets out of the way.

## Anti-references

Hard nos. Any output that resembles these has failed.

- **Legacy legal SaaS (Clio, MyCase, PracticePanther, Smokeball).** Navy-and-cream chrome, dense toolbars, inline-tooltip clutter, 2012-enterprise form vibe. We will not look like the tools we are replacing.
- **Generic AI tool template.** Gradient orbs, glass cards, "Ask me anything" hero, ChatGPT-clone dark mode. Blawby is an AI-assisted product, not an AI demo.
- **Stuffy law-firm aesthetic.** Mahogany, leather, gold scales-of-justice, serif headlines, courthouse columns. The product is not a law firm; it serves them.
- **Consumer-warm SaaS.** Pastel illustrations, hand-drawn fonts, Cal.com or Notion-personal energy. Wrong register for professional tooling.

## Design Principles

1. **Information first, chrome last.** Surfaces are made of content, not containers. A page is judged by the density and clarity of useful signal, not the polish of its borders.
2. **Reward expertise.** Every common task has a keyboard path. Dense tables, inline editing, and shortcuts beat modal-driven hand-holding. Assume the user is competent until proven otherwise.
3. **One read, one decision.** Each surface answers the question "what should I do next?" If a screen cannot be summarized in one sentence about the next action, it has too many ideas on it.
4. **Quiet color, loud hierarchy.** The blue accent is for signal, not decoration. Hierarchy comes from size, weight, and spacing. Color is reserved for state — focus, success, error, in-progress — and for moments that genuinely matter.
5. **Be ignorable.** A great session is one where the lawyer forgot about the tool and remembers the work. We do not delight; we disappear.

## Accessibility & Inclusion

- **WCAG 2.1 AA** as the baseline: contrast, focus visibility, keyboard reachability, screen-reader semantics on every surface.
- **Internationalization is a first-class concern.** The codebase already ships 13+ locales and tests RTL. Copy must survive translation; never encode meaning in word order, length, or layout-dependent phrasing.
- **Light and dark themes are equal first-class citizens.** Neither is "the default."
- **Reduced motion is honored.** Motion is purposeful and never required to understand state.
