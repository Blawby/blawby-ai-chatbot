# Product-shell style exceptions

Issue #725 applies one strict boundary: product work uses the sans type voice and static styling uses design-system classes. The exact allowlists live in `scripts/lib/productShellStyleAudit.ts` and are enforced by unit tests.

## Inline styles

Remaining inline styles belong to one of five categories:

| Category | Allowed use |
| --- | --- |
| Theme preview | Miniature theme swatches and the debug dialog matrix need literal preview values without changing the active app theme. |
| Document rendering | Engagement letters and exported invoice previews need print geometry and document-specific layout values. |
| Runtime geometry and virtualization | Progress width, SVG stroke offsets, measured mobile insets, virtual-list sizing, and caller-supplied dimensions are values known only at runtime. |
| Platform positioning and layers | Popovers, dialogs, drawers, menus, and overlays receive measured coordinates or centralized z-index values. |
| Primitive escape hatch | The shared `Button` passes through a caller's typed `style` prop; call sites still have to satisfy this allowlist. |

Static padding, colors, typography, grids, borders, shadows, and decoration were moved to tokenized classes. Adding an inline style in any other file fails the regression test and requires either a class migration or an explicit category decision here.

## Serif typography

Serif remains only on:

- public intake editorial components, where a client is reading a guided public surface;
- client engagement and signature components, where the UI renders the legal document being reviewed;
- `.letter-paper` rules in `src/index.css`, which are the exported-document stylesheet.

Settings, calendar, trust, contacts, invoices, matters, reports, onboarding, and all other product-shell working surfaces use sans. Marketing pricing also uses sans until the repository ships the documented Outfit brand token; it does not substitute legal-document serif as a display font.

## Visual review matrix

The affected product surfaces are reviewed through the developer tunnel at mobile, tablet, and desktop widths in light, dark, midnight, and parchment themes. Public intake and engagement-document exceptions are reviewed separately to confirm that their editorial/legal type voice remains intentional.
