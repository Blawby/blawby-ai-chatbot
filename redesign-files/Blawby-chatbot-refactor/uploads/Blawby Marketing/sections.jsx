const { useState: useStateS } = React;

/* ---------- Reusable bits ---------- */
function SectionLabel({ children, num }) {
  return (
    <div className="section-label">
      {num && <span className="mono">{num}</span>}
      <span className="mono small-caps">{children}</span>
      <span className="rule" />
    </div>
  );
}

function Placeholder({ caption, height = 280, ratio }) {
  const style = ratio
    ? { aspectRatio: ratio }
    : { height };
  return (
    <div className="ph" style={style}>
      <div className="ph-stripes" />
      <div className="ph-caption mono small-caps">{caption}</div>
    </div>
  );
}

/* ---------- Problem ---------- */
function ProblemSection() {
  return (
    <section className="container section-problem" id="problem">
      <SectionLabel num="01">The problem</SectionLabel>
      <div className="problem-grid">
        <h2 className="display h2">
          A solo practice runs on <em>seven tabs</em>, three vendors, and a prayer that the trust math works out.
        </h2>
        <div className="problem-side">
          <p className="lede">
            Intake forms in one tool. Engagement letters in another. Time tracking in a spreadsheet. Invoices in QuickBooks. Card processing that doesn't understand IOLTA. Files in email.
          </p>
          <p className="lede">
            Blawby replaces the stack with one ledger of record — from the first inquiry to the final transfer out of trust.
          </p>
        </div>
      </div>
      <div className="stitched-row">
        {["Intake form", "Engagement PDF", "Time tracker", "QuickBooks", "Stripe link", "Trust ledger", "Email files"].map((t, i) => (
          <span key={t} className="stitched-pill mono">
            <span className="stitched-x">×</span>{t}
          </span>
        ))}
      </div>
    </section>
  );
}

/* ---------- Workflow Detail (the five steps, with placeholders) ---------- */
function WorkflowDetail() {
  const rows = [
    {
      num: "01",
      kicker: "Capture",
      title: "Intake that sounds like you wrote it.",
      body: "Drop a widget on your site, ask the questions you actually need, and price-screen with conditional fees before anything hits your inbox.",
      bullets: ["Custom fields & conditions", "Conflict check on submit", "Auto-route by practice area"],
      shot: "Intake widget — composer view"
    },
    {
      num: "02",
      kicker: "Triage",
      title: "Decide in 30 seconds, not 30 minutes.",
      body: "Every submission lands in a triage queue with an AI second opinion. Accept and convert to a matter, decline with a templated note, or ask AI to dig deeper.",
      bullets: ["Accept · Decline · Ask AI", "Conflict & jurisdiction flags", "One-click matter creation"],
      shot: "Triage queue — submission detail"
    },
    {
      num: "03",
      kicker: "Engage",
      title: "Scope, fees, and signature in one link.",
      body: "Generate an engagement letter from a template, include the fee terms, and send a single signing link. The retainer is collected the moment they sign.",
      bullets: ["Reusable engagement templates", "Risk & acknowledgment clauses", "Retainer collected on signature"],
      shot: "Engagement letter — signer view"
    },
    {
      num: "04",
      kicker: "Manage",
      title: "Every matter has a single page of record.",
      body: "Tabs for activity, files, time, billing, and the client portal. Whatever happens on the matter happens here — no second tab, no second tool.",
      bullets: ["Time entries on the matter", "Shared files & client chat", "Activity log of everything"],
      shot: "Matter detail — tabbed view"
    },
    {
      num: "05",
      kicker: "Collect",
      title: "Invoice, get paid, sweep to trust — cleanly.",
      body: "Generate the invoice from time entries, send a payment link that accepts card or ACH, and route earned funds from trust to operating in one signed step.",
      bullets: ["Card 2.9% + 30¢ · ACH 0.8%", "Trust-aware ledger", "Documented trust transfers"],
      shot: "Invoice & trust transfer"
    }
  ];

  return (
    <section className="section-workflow" id="workflow">
      <div className="container">
        <SectionLabel num="02">The five-step loop</SectionLabel>
        <h2 className="display h2 workflow-h2">
          One ledger from <em>first hello</em> to <em>final transfer</em>.
        </h2>
      </div>
      <div className="workflow-rows">
        {rows.map((r, i) => (
          <div key={r.num} className={"wf-row " + (i % 2 ? "wf-row-rev" : "")}>
            <div className="container wf-row-inner">
              <div className="wf-row-text">
                <div className="wf-row-meta">
                  <span className="mono big-num">{r.num}</span>
                  <span className="mono small-caps">{r.kicker}</span>
                </div>
                <h3 className="display h3">{r.title}</h3>
                <p className="lede">{r.body}</p>
                <ul className="wf-bullets">
                  {r.bullets.map((b) => (
                    <li key={b}><span className="bullet-mark mono">·</span>{b}</li>
                  ))}
                </ul>
              </div>
              <div className="wf-row-shot">
                <Placeholder caption={r.shot} ratio="4 / 3" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------- Feature Cards ---------- */
function FeatureCards() {
  const cards = [
    { tag: "01", name: "Intake", lines: "Widget, templates, conditions, fees, conflict-checks, jurisdiction routing." },
    { tag: "02", name: "Engagements", lines: "Scope, fee, risk, acknowledgments, e-signature, retainer collection." },
    { tag: "03", name: "Matters", lines: "Activity, files, time, billing, invoices, client chat — one canonical page." },
    { tag: "04", name: "Billing", lines: "Time entries to invoices to statements, with a real receivables view." },
    { tag: "05", name: "Payments", lines: "Card and ACH. 2.9% + 30¢ on cards, 0.8% on ACH, capped at $5." },
    { tag: "06", name: "Trust & Compliance", lines: "IOLTA-aware ledger. Documented trust-to-operating transfers." },
    { tag: "07", name: "Client Portal", lines: "A clean login for your clients — chat, documents, balances, signed forms." }
  ];
  return (
    <section className="container section-features" id="features">
      <SectionLabel num="03">What's in the box</SectionLabel>
      <h2 className="display h2">
        Seven surfaces. <em>One ledger.</em>
      </h2>
      <div className="feature-grid">
        {cards.map((c, i) => (
          <a key={c.tag} className={"feature-card " + (i === 0 ? "feature-card-lg" : "")} href={"#feature-" + c.tag}>
            <div className="feature-top">
              <span className="mono small-caps">{c.tag} · Feature</span>
              <span className="feature-arrow" aria-hidden="true">↗</span>
            </div>
            <div className="feature-name display">{c.name}</div>
            <div className="feature-lines">{c.lines}</div>
            <div className="feature-foot mono small-caps">View docs →</div>
          </a>
        ))}
      </div>
    </section>
  );
}

/* ---------- IOLTA / Compliance ---------- */
function ComplianceSection() {
  return (
    <section className="section-compliance" id="trust">
      <div className="container compliance-grid">
        <div className="compliance-left">
          <SectionLabel num="04">Trust & IOLTA</SectionLabel>
          <h2 className="display h2">
            Trust math that bar counsel can <em>read in a glance.</em>
          </h2>
          <p className="lede">
            Every dollar lands in the right account from the first swipe. Retainers go to trust. Earned fees go to operating. Transfers are documented, dated, and reversible.
          </p>
          <ul className="compliance-list">
            <li><span className="mono small-caps light-mono">a.</span> Separate trust and operating ledgers, per matter.</li>
            <li><span className="mono small-caps light-mono">b.</span> Client-by-client trust reconciliation, on demand.</li>
            <li><span className="mono small-caps light-mono">c.</span> Trust-to-operating transfers documented with the underlying invoice.</li>
            <li><span className="mono small-caps light-mono">d.</span> Card processor that recognizes IOLTA accounts.</li>
          </ul>
        </div>
        <div className="compliance-right">
          <div className="compliance-card">
            <div className="cc-row cc-row-head">
              <span className="mono small-caps">Trust ledger — Doe, Jane</span>
              <span className="mono">May 12, 2026</span>
            </div>
            <div className="cc-row"><span>Retainer received</span><span className="mono pos">+ $3,500.00</span></div>
            <div className="cc-row"><span>Invoice #1041 earned</span><span className="mono">$1,280.00</span></div>
            <div className="cc-row"><span>Trust → Operating transfer</span><span className="mono neg">− $1,280.00</span></div>
            <div className="cc-row cc-row-foot"><span>Trust balance</span><span className="mono">$2,220.00</span></div>
            <div className="cc-stamp mono small-caps">Documented · reversible · audit-ready</div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- Comparison ---------- */
function ComparisonSection() {
  const rows = [
    ["IOLTA-aware ledger", true, false],
    ["Trust → operating transfers", true, false],
    ["Engagement letter + signature in one link", true, false],
    ["Intake widget with conditional fees", true, false],
    ["Card + ACH processing", true, true],
    ["Generic e-commerce checkout flow", false, true],
    ["Built for solo & small-firm attorneys", true, false]
  ];
  return (
    <section className="container section-compare" id="compare">
      <SectionLabel num="05">Built for law firms</SectionLabel>
      <h2 className="display h2">
        A payment processor knows <em>checkouts.</em> Blawby knows <em>matters.</em>
      </h2>
      <div className="compare-table">
        <div className="compare-head">
          <div></div>
          <div className="compare-h compare-h-us">
            <span className="display">Blawby</span>
            <span className="mono small-caps">Legal practice platform</span>
          </div>
          <div className="compare-h">
            <span className="display dim">Generic payments</span>
            <span className="mono small-caps">Stripe-style checkout</span>
          </div>
        </div>
        {rows.map(([label, us, them]) => (
          <div key={label} className="compare-row">
            <div className="compare-cell compare-cell-label">{label}</div>
            <div className="compare-cell compare-cell-us">{us ? <span className="check">●</span> : <span className="cross">—</span>}</div>
            <div className="compare-cell">{them ? <span className="check dim-check">●</span> : <span className="cross">—</span>}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------- Pricing ---------- */
function PricingSection() {
  return (
    <section className="container section-pricing" id="pricing">
      <SectionLabel num="06">Pricing</SectionLabel>
      <h2 className="display h2">
        One price. <em>No surprises.</em>
      </h2>
      <div className="pricing-card">
        <div className="pricing-main">
          <div className="pricing-amount">
            <span className="display price-num">$40</span>
            <div className="price-unit">
              <div className="mono small-caps">per active user</div>
              <div className="mono small-caps dim">per month</div>
            </div>
          </div>
          <p className="pricing-note">Pay only for users who logged in this month. No seats sitting idle, no annual contract, no setup fee.</p>
          <a href="#start" className="btn btn-primary">Start now</a>
        </div>
        <div className="pricing-side">
          <div className="pricing-row">
            <span className="mono small-caps">Card</span>
            <span className="display">2.9% + 30¢</span>
          </div>
          <div className="pricing-row">
            <span className="mono small-caps">ACH</span>
            <span className="display">0.8% <span className="dim">/ cap $5</span></span>
          </div>
          <div className="pricing-row">
            <span className="mono small-caps">Invoice fee</span>
            <span className="display">0%</span>
          </div>
          <div className="pricing-row pricing-row-last">
            <span className="mono small-caps">IOLTA-compliant</span>
            <span className="display">Yes</span>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- Docs Hub (formerly "course overview") ---------- */
function DocsHub() {
  const items = [
    { area: "Intake", lines: "Configure your client intake widget and triage new leads." },
    { area: "Engagements", lines: "Send scope, fee, and acknowledgment terms for client signature." },
    { area: "Matters", lines: "Track work, files, time, billing, invoices, and client activity." },
    { area: "Trust & Compliance", lines: "Document earned fees and trust-to-operating transfers." }
  ];
  return (
    <section className="container section-docs" id="docs">
      <SectionLabel num="07">Learn how Blawby works</SectionLabel>
      <div className="docs-head">
        <h2 className="display h2">
          Short, practical guides for <em>each workflow.</em>
        </h2>
        <a href="#docs-all" className="btn btn-ghost">View all docs →</a>
      </div>
      <div className="docs-grid">
        {items.map((i, idx) => (
          <a key={i.area} className="docs-card" href={"#docs-" + i.area}>
            <div className="docs-card-top">
              <span className="mono small-caps">Guide · 0{idx + 1}</span>
              <span className="mono small-caps">Read →</span>
            </div>
            <div className="docs-card-name display">{i.area}</div>
            <div className="docs-card-lines">{i.lines}</div>
          </a>
        ))}
      </div>
    </section>
  );
}

/* ---------- FAQ ---------- */
function FAQSection() {
  const faqs = [
    { q: "Is Blawby actually IOLTA-compliant?", a: "Yes. Trust and operating are separate ledgers per matter, with documented transfers and per-client reconciliation. The card processor recognizes IOLTA accounts so retainers don't get netted against fees." },
    { q: "Do you support ACH as well as cards?", a: "Both. Card transactions are 2.9% + 30¢; ACH is 0.8% with a $5 cap per payment — useful for larger retainers and invoices." },
    { q: "What does setup actually look like?", a: "A solo attorney is typically live in an afternoon. Add your IOLTA and operating bank accounts, paste the intake widget on your site, draft one engagement template, and start triaging." },
    { q: "Do clients need an account to pay?", a: "No. Payment links work from email or text. Clients only sign in if they want the portal — chat, shared files, balances, and signed forms." },
    { q: "Can I cancel anytime?", a: "Yes. You're only billed for users that actually logged in that month. No annual contract." }
  ];
  const [open, setOpen] = useStateS(0);
  return (
    <section className="container section-faq" id="faq">
      <SectionLabel num="08">Frequently asked</SectionLabel>
      <h2 className="display h2">Common objections, <em>answered.</em></h2>
      <div className="faq-list">
        {faqs.map((f, i) => (
          <button
            key={f.q}
            className={"faq-item " + (open === i ? "is-open" : "")}
            onClick={() => setOpen(open === i ? -1 : i)}
          >
            <div className="faq-q-row">
              <span className="mono faq-num">Q.0{i + 1}</span>
              <span className="faq-q display">{f.q}</span>
              <span className="faq-toggle mono">{open === i ? "—" : "+"}</span>
            </div>
            <div className="faq-a-wrap">
              <div className="faq-a">{f.a}</div>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

/* ---------- Final CTA ---------- */
function FinalCTA() {
  return (
    <section className="section-cta" id="start">
      <div className="container cta-inner">
        <div className="cta-top mono small-caps">
          <span>The Blawby loop</span>
          <span className="rule" />
          <span>Ready when you are</span>
        </div>
        <h2 className="display cta-h">
          Start managing legal intake, matters, and trust-safe payments with <em>Blawby.</em>
        </h2>
        <div className="cta-actions">
          <a href="#start" className="btn btn-primary btn-lg">Start now</a>
          <a href="#docs" className="btn btn-ghost btn-lg">View docs →</a>
        </div>
        <div className="cta-meta mono small-caps">
          <span>$40 per active user / month</span>
          <span className="dot" />
          <span>No setup fee</span>
          <span className="dot" />
          <span>Cancel any month</span>
        </div>
      </div>
    </section>
  );
}

/* ---------- Footer ---------- */
function FooterBlock() {
  const cols = [
    { h: "Product", items: ["Intake", "Engagements", "Matters", "Billing", "Payments", "Trust & Compliance", "Client Portal"] },
    { h: "Resources", items: ["Docs overview", "Pricing", "Changelog", "Security", "Status"] },
    { h: "Firm", items: ["About", "Customers", "Contact", "Careers"] },
    { h: "Legal", items: ["Terms", "Privacy", "DPA", "Bar compliance"] }
  ];
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div className="footer-brand">
          <div className="brand-mark">
            <span className="brand-mark-glyph display">B</span>
            <span className="brand-mark-word display">Blawby</span>
          </div>
          <p className="footer-tag">Legal practice software for solo and small-firm attorneys.</p>
          <div className="mono small-caps footer-meta">
            <span>Est. for lawyers</span>
            <span className="rule" />
            <span>v. 2026.5</span>
          </div>
        </div>
        {cols.map((c) => (
          <div key={c.h} className="footer-col">
            <div className="mono small-caps footer-h">{c.h}</div>
            <ul>
              {c.items.map((it) => <li key={it}><a href={"#" + it.toLowerCase().replace(/\s/g, "-")}>{it}</a></li>)}
            </ul>
          </div>
        ))}
      </div>
      <div className="container footer-bottom">
        <span className="mono small-caps">© 2026 Blawby, Inc.</span>
        <span className="mono small-caps dim">Built for the practice of law, not the practice of payments.</span>
      </div>
    </footer>
  );
}

Object.assign(window, {
  SectionLabel, Placeholder,
  ProblemSection, WorkflowDetail, FeatureCards, ComplianceSection,
  ComparisonSection, PricingSection, DocsHub, FAQSection, FinalCTA, FooterBlock
});
