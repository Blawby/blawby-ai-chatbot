const { useEffect, useState, useRef } = React;

function WorkflowHero() {
  const steps = [
    { num: "01", label: "Intake", desc: "Widget on your site captures a qualified lead." },
    { num: "02", label: "Triage", desc: "Review, accept, or decline with AI assist." },
    { num: "03", label: "Engage", desc: "Send scope, fees, and signature in one link." },
    { num: "04", label: "Matter", desc: "Track work, time, files, and client activity." },
    { num: "05", label: "Collect", desc: "Invoice, accept card or ACH, route to trust." }
  ];
  const [revealed, setRevealed] = useState(-1);
  const [lineProgress, setLineProgress] = useState(0);

  useEffect(() => {
    const timers = [];
    steps.forEach((_, i) => {
      timers.push(setTimeout(() => setRevealed(i), 350 + i * 220));
    });
    timers.push(setTimeout(() => setLineProgress(1), 400));
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="workflow-hero">
      <div className="workflow-meta">
        <span className="mono small-caps">Fig. 01</span>
        <span className="mono small-caps">The Blawby loop</span>
        <span className="mono small-caps">Intake → Trust transfer</span>
      </div>
      <div className="workflow-track">
        <svg className="workflow-line" viewBox="0 0 1000 2" preserveAspectRatio="none" aria-hidden="true">
          <line x1="0" y1="1" x2="1000" y2="1" stroke="var(--rule)" strokeWidth="1" strokeDasharray="4 4" />
          <line
            x1="0" y1="1" x2="1000" y2="1"
            stroke="var(--accent)" strokeWidth="1.5"
            style={{
              strokeDasharray: 1000,
              strokeDashoffset: 1000 - lineProgress * 1000,
              transition: "stroke-dashoffset 1800ms cubic-bezier(0.7,0,0.2,1)"
            }}
          />
        </svg>
        <div className="workflow-steps">
          {steps.map((s, i) => (
            <div
              key={s.num}
              className={"wf-step " + (revealed >= i ? "is-in" : "")}
              style={{ transitionDelay: revealed >= i ? "0ms" : "0ms" }}
            >
              <div className="wf-node">
                <span className="wf-dot" />
              </div>
              <div className="wf-card">
                <div className="wf-num mono">{s.num}</div>
                <div className="wf-label">{s.label}</div>
                <div className="wf-desc">{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

window.WorkflowHero = WorkflowHero;
