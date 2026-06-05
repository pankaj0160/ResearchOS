import { useState, useEffect, useRef } from "react";

const AGENTS = [
  { key: "search", icon: "⌕", label: "Search Agent", desc: "Queries the web in real time", tool: "tavily_search", color: "#f59e0b" },
  { key: "reader", icon: "◈", label: "Reader Agent", desc: "Extracts & summarizes sources", tool: "scrape_url", color: "#14b8a6" },
  { key: "writer", icon: "✦", label: "Writer Agent", desc: "Synthesizes final reports", tool: "compose_report", color: "#6366f1" },
  { key: "critic", icon: "◉", label: "Critic Agent", desc: "Validates & refines output", tool: "fact_check", color: "#22c55e" },
];

const MODULES = [
  { icon: "🔬", title: "Research", color: "#0d9488", desc: "Multi-agent topic research with live SSE streaming." },
  { icon: "📄", title: "PDF Chat", color: "#6366f1", desc: "Upload documents and chat with them via RAG." },
  { icon: "📰", title: "News", color: "#f59e0b", desc: "AI-summarized briefings from the latest sources." },
  { icon: "🌐", title: "Dashboard", color: "#22c55e", desc: "Weather, travel safety, and live headlines." },
];

const STATS = [
  { value: "4", suffix: " AI Agents", label: "Orchestrated in parallel" },
  { value: "10x", suffix: "", label: "Faster research cycles" },
  { value: "99.9%", suffix: "", label: "Uptime SLA" },
  { value: "50+", suffix: " Tools", label: "Integrated capabilities" },
];

const FAQS = [
  { q: "What is ResearchOS?", a: "ResearchOS is a multi-agent AI research platform that combines document intelligence, real-time web search, and AI synthesis into a unified workspace." },
  { q: "How does the multi-agent pipeline work?", a: "Four specialized agents collaborate: Search finds sources, Reader extracts content, Writer synthesizes reports, and Critic validates accuracy — all streaming live via SSE." },
  { q: "Can I upload my own documents?", a: "Yes. The PDF Chat module supports document uploads with RAG-powered Q&A. Upload PDFs and ask questions directly against their content." },
  { q: "Is there an API for developers?", a: "ResearchOS is built on FastAPI with LangChain and Groq. A developer API is available on the Pro and Enterprise plans." },
  { q: "What LLMs are supported?", a: "Currently Groq (LLaMA-3, Mixtral) with OpenAI and Anthropic support coming soon. Models are swappable per agent." },
  { q: "How does API key failover work?", a: "ResearchOS automatically rotates across multiple API keys to ensure zero-interruption research runs, even under rate limits." },
  { q: "Is my research data private?", a: "Yes. Each workspace is isolated. Documents and research sessions are encrypted at rest and never used for model training." },
  { q: "What pricing plans are available?", a: "Free tier with limited runs, Pro for individuals ($19/mo), and Enterprise with custom limits, SSO, and dedicated support." },
];

const FEATURES = [
  { icon: "⟳", title: "SSE Streaming", desc: "Watch execution unfold event by event with live server-sent updates." },
  { icon: "◎", title: "Full Observability", desc: "Every agent thought, tool call, and decision surfaced in real time." },
  { icon: "↯", title: "Key Failover", desc: "Automatic rotation across multiple API keys for zero-interruption runs." },
];

function useTheme() {
  const [dark, setDark] = useState(true);
  return { dark, toggle: () => setDark(d => !d) };
}

function useInView(ref) {
  const [vis, setVis] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVis(true); }, { threshold: 0.15 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return vis;
}

function Section({ children, style }) {
  const ref = useRef();
  const vis = useInView(ref);
  return (
    <div ref={ref} style={{
      opacity: vis ? 1 : 0, transform: vis ? "translateY(0)" : "translateY(32px)",
      transition: "opacity 0.7s ease, transform 0.7s ease", ...style
    }}>
      {children}
    </div>
  );
}

export default function Landing() {
  const { dark, toggle } = useTheme();
  const [faqOpen, setFaqOpen] = useState(null);
  const [faqSearch, setFaqSearch] = useState("");
  const [ticketForm, setTicketForm] = useState({ name: "", email: "", subject: "", message: "" });
  const [ticketSent, setTicketSent] = useState(false);
  const [showCreator, setShowCreator] = useState(false);
  const [activeNav, setActiveNav] = useState("home");

  const bg = dark ? "#08080a" : "#f8f7f4";
  const surface = dark ? "#111113" : "#ffffff";
  const surface2 = dark ? "#18181b" : "#f1f0ed";
  const border = dark ? "#27272a" : "#e4e4e7";
  const text = dark ? "#fafafa" : "#09090b";
  const muted = dark ? "#71717a" : "#52525b";
  const accent = "#0d9488";
  const accentLight = dark ? "#14b8a640" : "#0d948820";

  const filteredFaqs = FAQS.filter(f =>
    f.q.toLowerCase().includes(faqSearch.toLowerCase()) ||
    f.a.toLowerCase().includes(faqSearch.toLowerCase())
  );

  const handleTicket = (e) => {
    e.preventDefault();
    setTicketSent(true);
    setTimeout(() => setTicketSent(false), 4000);
    setTicketForm({ name: "", email: "", subject: "", message: "" });
  };

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&family=Fraunces:ital,wght@0,700;0,900;1,700&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html { scroll-behavior: smooth; }
    body { font-family: 'Space Grotesk', sans-serif; }
    ::selection { background: #0d948840; }
    ::-webkit-scrollbar { width: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: #27272a; border-radius: 3px; }
    @keyframes scan { 0%{top:-2px} 100%{top:100%} }
    @keyframes pulse-dot { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(.85)} }
    @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
    @keyframes spin-slow { from{transform:rotate(0)} to{transform:rotate(360deg)} }
    @keyframes gradient-x { 0%,100%{background-position:0% 50%} 50%{background-position:100% 50%} }
    @keyframes fadeUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
    @keyframes slideIn { from{opacity:0;transform:translateX(-12px)} to{opacity:1;transform:translateX(0)} }
    @keyframes glow-pulse { 0%,100%{opacity:.06} 50%{opacity:.12} }
    .scan-line { position:absolute;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,#0d9488,transparent);animation:scan 6s linear infinite;opacity:.2; }
    .float { animation:float 4s ease-in-out infinite; }
    .gradient-text {
      background: linear-gradient(135deg, #14b8a6 0%, #5eead4 35%, #a7f3d0 65%, #14b8a6 100%);
      background-size: 300% 300%;
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      animation: gradient-x 4s ease infinite;
    }
    .gradient-text-warm {
      background: linear-gradient(135deg, #f59e0b 0%, #fb923c 50%, #f59e0b 100%);
      background-size: 200% 200%;
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      animation: gradient-x 3s ease infinite;
    }
    .nav-link { transition: color .2s; cursor: pointer; }
    .nav-link:hover { color: #0d9488 !important; }
    .btn-primary {
      background: #0d9488; color: #fff; border: none; border-radius: 9px;
      padding: 11px 24px; font-family: 'Space Grotesk', sans-serif;
      font-weight: 600; font-size: 13px; cursor: pointer; letter-spacing: .01em;
      transition: all .2s; position: relative; overflow: hidden;
    }
    .btn-primary::after { content:''; position:absolute; inset:0; background:#fff; opacity:0; transition:opacity .2s; }
    .btn-primary:hover::after { opacity:.1; }
    .btn-primary:active { transform: scale(.98); }
    .btn-ghost {
      background: transparent; border: 1px solid; border-radius: 9px;
      padding: 11px 22px; font-family: 'Space Grotesk', sans-serif;
      font-weight: 500; font-size: 13px; cursor: pointer; transition: all .2s;
    }
    .btn-ghost:hover { background: rgba(13,148,136,.08); border-color: #0d9488 !important; color: #0d9488 !important; }
    .card {
      border-radius: 14px; border: 1px solid; padding: 20px;
      transition: border-color .25s, transform .25s, box-shadow .25s;
    }
    .card:hover { transform: translateY(-3px); }
    .agent-card { border-radius: 14px; border: 1px solid; padding: 16px; transition: all .25s; }
    .agent-card:hover { transform: translateY(-2px); }
    .faq-item { border-bottom: 1px solid; }
    .faq-btn { width:100%; text-align:left; background:transparent; border:none; cursor:pointer; padding:16px 0; font-family:'Space Grotesk',sans-serif; display:flex; justify-content:space-between; align-items:center; }
    .faq-chevron { transition: transform .3s; font-size: 16px; }
    .tag { display:inline-flex; align-items:center; gap:6px; padding:4px 10px; border-radius:20px; font-size:10px; font-family:'DM Mono',monospace; letter-spacing:.06em; text-transform:uppercase; }
    .stat-card { border-radius: 14px; padding: 24px 20px; border: 1px solid; text-align: center; transition: all .2s; }
    .stat-card:hover { transform: translateY(-2px); }
    .pipeline-node { transition: all .3s; cursor: pointer; }
    .pipeline-node:hover { transform: scale(1.05); }
    .modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,.7); backdrop-filter:blur(8px); z-index:1000; display:flex; align-items:center; justify-content:center; padding:1rem; }
    .modal-box { border-radius: 18px; border: 1px solid; max-width: 520px; width:100%; max-height:90vh; overflow-y:auto; padding: 28px; }
    .input-field {
      width:100%; padding:10px 14px; border-radius:9px; border:1px solid;
      font-family:'Space Grotesk',sans-serif; font-size:13px; transition:border-color .2s; outline:none;
    }
    .input-field:focus { border-color: #0d9488 !important; }
    .grid-bg {
      background-image: linear-gradient(rgba(13,148,136,.06) 1px, transparent 1px),
        linear-gradient(90deg, rgba(13,148,136,.06) 1px, transparent 1px);
      background-size: 48px 48px;
    }
    .section-label { font-size:10px; letter-spacing:.14em; text-transform:uppercase; font-family:'DM Mono',monospace; }
    .highlight-box {
      border-left: 3px solid #0d9488; padding: 14px 18px; border-radius: 0 10px 10px 0;
    }
  `;

  return (
    <div style={{ background: bg, color: text, minHeight: "100vh", fontFamily: "'Space Grotesk', sans-serif", transition: "background .3s, color .3s" }}>
      <style>{css}</style>

      {/* ── Navbar ── */}
      <nav style={{
        position: "fixed", top: 0, left: 0, right: 0, height: 56, zIndex: 200,
        background: dark ? "rgba(8,8,10,.88)" : "rgba(248,247,244,.9)",
        backdropFilter: "blur(14px)",
        borderBottom: `1px solid ${border}`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 1.5rem"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 30, height: 30, background: accent, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Fraunces',serif", fontWeight: 900, fontSize: 14, color: "#fff" }}>R</div>
          <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: "-.03em" }}>ResearchOS</span>
          <span style={{ marginLeft: 4, background: accentLight, color: accent, fontSize: 9, padding: "2px 7px", borderRadius: 20, fontFamily: "'DM Mono',monospace", letterSpacing: ".08em" }}>BETA</span>
        </div>
        <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
          {["Features", "Agents", "Pricing", "Support"].map(item => (
            <a key={item} href={`#${item.toLowerCase()}`} className="nav-link" style={{ fontSize: 13, color: muted, fontWeight: 500, textDecoration: "none" }}>{item}</a>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={toggle} style={{ background: surface2, border: `1px solid ${border}`, borderRadius: 8, width: 34, height: 34, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, transition: "all .2s" }}>
            {dark ? "☀️" : "🌙"}
          </button>
          <button className="btn-ghost" style={{ borderColor: border, color: muted, padding: "7px 16px" }}>Sign in</button>
          <button className="btn-primary" style={{ padding: "7px 16px" }}>Get started →</button>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden", padding: "100px 1.5rem 60px" }}>
        <div className="grid-bg" style={{ position: "absolute", inset: 0, opacity: dark ? .4 : .25 }} />
        <div className="scan-line" />
        {/* Glow orbs */}
        <div style={{ position: "absolute", top: "40%", left: "50%", transform: "translate(-50%,-50%)", width: 600, height: 400, borderRadius: "50%", background: "radial-gradient(circle,#0d9488,transparent 70%)", opacity: dark ? .07 : .04, animation: "glow-pulse 4s ease-in-out infinite", pointerEvents: "none" }} />
        <div style={{ position: "absolute", top: "20%", right: "15%", width: 200, height: 200, borderRadius: "50%", background: "radial-gradient(circle,#f59e0b,transparent)", opacity: .04, pointerEvents: "none" }} />

        {/* Badge */}
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 14px", borderRadius: 30, border: `1px solid ${border}`, background: surface, marginBottom: 32, animation: "fadeUp .6s ease both" }}>
          <div style={{ display: "flex", gap: 3 }}>
            {["#f59e0b","#14b8a6","#0d9488","#22c55e"].map((c,i) => (
              <div key={c} style={{ width: 6, height: 6, borderRadius: "50%", background: c, animation: `pulse-dot 2s ease-in-out ${i*.2}s infinite` }} />
            ))}
          </div>
          <span style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: muted, letterSpacing: ".1em" }}>MULTI-AGENT RESEARCH PLATFORM</span>
        </div>

        {/* Headline */}
        <div style={{ textAlign: "center", maxWidth: 820, animation: "fadeUp .7s .1s ease both" }}>
          <h1 style={{ fontFamily: "'Fraunces', serif", fontWeight: 900, fontSize: "clamp(3.2rem,7vw,6.5rem)", lineHeight: .92, letterSpacing: "-.03em", marginBottom: 24 }}>
            <span style={{ display: "block", color: text }}>Transform</span>
            <span className="gradient-text" style={{ display: "inline-block", marginBottom: 4 }}>Information</span>
            <span style={{ display: "block", color: text }}>Into Intelligence</span>
          </h1>
          <p style={{ fontSize: "clamp(1rem,2.2vw,1.2rem)", color: muted, lineHeight: 1.7, maxWidth: 580, margin: "0 auto 36px" }}>
            ResearchOS combines AI agents, document intelligence, real-time insights, and knowledge discovery into a unified workspace for modern researchers, analysts, and innovators.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", animation: "fadeUp .8s .2s ease both" }}>
            <button className="btn-primary" style={{ padding: "13px 30px", fontSize: 14, boxShadow: "0 0 40px #0d948848" }}>Start researching →</button>
            <button className="btn-ghost" style={{ borderColor: border, color: muted, padding: "13px 24px", fontSize: 14 }} onClick={() => setShowCreator(true)}>View demo</button>
          </div>
        </div>

        {/* Pipeline preview */}
        <div style={{ marginTop: 56, animation: "fadeUp .9s .35s ease both" }}>
          <PipelineFlow dark={dark} surface={surface} border={border} muted={muted} />
        </div>

        {/* Stats strip */}
        <div style={{ marginTop: 52, display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 1, background: border, borderRadius: 14, overflow: "hidden", maxWidth: 700, width: "100%", border: `1px solid ${border}` }}>
          {STATS.map((s, i) => (
            <div key={i} style={{ background: surface, padding: "18px 16px", textAlign: "center" }}>
              <div style={{ fontFamily: "'Fraunces',serif", fontWeight: 900, fontSize: "1.6rem", lineHeight: 1, color: text }}>
                {s.value}<span style={{ color: accent, fontSize: "1.2rem" }}>{s.suffix}</span>
              </div>
              <div style={{ fontSize: 11, color: muted, marginTop: 4, fontFamily: "'DM Mono',monospace", letterSpacing: ".04em" }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features / Modules ── */}
      <section id="features" style={{ padding: "80px 1.5rem", maxWidth: 960, margin: "0 auto" }}>
        <Section>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <div className="section-label" style={{ color: accent, marginBottom: 12 }}>Platform Modules</div>
            <h2 style={{ fontFamily: "'Fraunces',serif", fontWeight: 900, fontSize: "clamp(1.8rem,4vw,3rem)", letterSpacing: "-.02em", color: text }}>
              Everything you need to <span className="gradient-text">research smarter</span>
            </h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 16 }}>
            {MODULES.map((m, i) => (
              <div key={m.title} className="card" style={{ background: surface, borderColor: border, animationDelay: `${i * 80}ms` }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: m.color + "18", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.5rem", marginBottom: 14, border: `1px solid ${m.color}28` }}>
                  {m.icon}
                </div>
                <div style={{ fontWeight: 700, fontSize: 15, color: text, marginBottom: 6 }}>{m.title}</div>
                <div style={{ fontSize: 12, color: muted, lineHeight: 1.6 }}>{m.desc}</div>
                <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: m.color, fontWeight: 600 }}>
                  Explore <span>→</span>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Bottom feature 3-cols */}
        <Section style={{ marginTop: 24 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 16 }}>
            {FEATURES.map((f, i) => (
              <div key={i} className="highlight-box" style={{ background: surface, borderColor: accent }}>
                <div style={{ fontSize: "1.4rem", marginBottom: 8 }}>{f.icon}</div>
                <div style={{ fontWeight: 700, fontSize: 14, color: text, marginBottom: 4 }}>{f.title}</div>
                <div style={{ fontSize: 12, color: muted, lineHeight: 1.6 }}>{f.desc}</div>
              </div>
            ))}
          </div>
        </Section>
      </section>

      {/* ── Agents ── */}
      <section id="agents" style={{ padding: "80px 1.5rem", background: dark ? "#0c0c0e" : "#f0eeea" }}>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <Section>
            <div style={{ textAlign: "center", marginBottom: 48 }}>
              <div className="section-label" style={{ color: accent, marginBottom: 12 }}>AI Agents</div>
              <h2 style={{ fontFamily: "'Fraunces',serif", fontWeight: 900, fontSize: "clamp(1.8rem,4vw,3rem)", letterSpacing: "-.02em", color: text }}>
                Meet your <span className="gradient-text-warm">research crew</span>
              </h2>
              <p style={{ fontSize: "1rem", color: muted, maxWidth: 520, margin: "14px auto 0" }}>Four specialized agents work in concert, each with distinct tools and responsibilities, delivering complete research reports autonomously.</p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 14 }}>
              {AGENTS.map((agent, i) => (
                <div key={agent.key} className="agent-card" style={{ background: surface, borderColor: border, borderColor: agent.color + "28" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: agent.color + "18", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.3rem", border: `1px solid ${agent.color}30`, color: agent.color }}>
                      {agent.icon}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: text }}>{agent.label}</div>
                      <div style={{ fontSize: 11, color: muted, marginTop: 2, fontFamily: "'DM Mono',monospace" }}>{agent.desc}</div>
                    </div>
                  </div>
                  {agent.tool && (
                    <div style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", padding: "3px 8px", borderRadius: 5, border: `1px solid ${border}`, display: "inline-block", color: muted }}>
                      tool: {agent.tool}
                    </div>
                  )}
                  <div style={{ marginTop: 12, height: 3, borderRadius: 2, background: `linear-gradient(90deg, ${agent.color}60, transparent)` }} />
                </div>
              ))}
            </div>
          </Section>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" style={{ padding: "80px 1.5rem", maxWidth: 900, margin: "0 auto" }}>
        <Section>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <div className="section-label" style={{ color: accent, marginBottom: 12 }}>Pricing</div>
            <h2 style={{ fontFamily: "'Fraunces',serif", fontWeight: 900, fontSize: "clamp(1.8rem,4vw,3rem)", letterSpacing: "-.02em", color: text }}>
              Simple, transparent <span className="gradient-text">pricing</span>
            </h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 20 }}>
            {[
              { name: "Free", price: "$0", period: "/mo", feats: ["5 research runs/day","PDF Chat (3 docs)","News briefings","Community support"], cta: "Start free", highlight: false },
              { name: "Pro", price: "$19", period: "/mo", feats: ["Unlimited runs","Unlimited PDFs","Priority Groq access","API access","Email support"], cta: "Start Pro →", highlight: true },
              { name: "Enterprise", price: "Custom", period: "", feats: ["Custom rate limits","SSO / SAML","Dedicated infra","SLA guarantee","Slack support"], cta: "Contact us", highlight: false },
            ].map((plan, i) => (
              <div key={plan.name} className="card" style={{
                background: plan.highlight ? accent : surface,
                borderColor: plan.highlight ? accent : border,
                border: plan.highlight ? `2px solid ${accent}` : `1px solid ${border}`,
                position: "relative", overflow: "hidden"
              }}>
                {plan.highlight && <div style={{ position: "absolute", top: 14, right: 14, background: "#ffffff28", color: "#fff", fontSize: 9, padding: "3px 8px", borderRadius: 20, fontFamily: "'DM Mono',monospace", letterSpacing: ".08em" }}>POPULAR</div>}
                <div style={{ fontWeight: 700, fontSize: 14, color: plan.highlight ? "#fff" : text, marginBottom: 8 }}>{plan.name}</div>
                <div style={{ fontFamily: "'Fraunces',serif", fontWeight: 900, fontSize: "2.5rem", lineHeight: 1, color: plan.highlight ? "#fff" : text }}>
                  {plan.price}<span style={{ fontSize: "1rem", fontFamily: "'Space Grotesk',sans-serif", fontWeight: 500, color: plan.highlight ? "#ffffff88" : muted }}>{plan.period}</span>
                </div>
                <div style={{ height: 1, background: plan.highlight ? "#ffffff28" : border, margin: "16px 0" }} />
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                  {plan.feats.map(f => (
                    <div key={f} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: plan.highlight ? "#ffffffcc" : muted }}>
                      <span style={{ color: plan.highlight ? "#fff" : accent, fontSize: 14 }}>✓</span> {f}
                    </div>
                  ))}
                </div>
                <button className={plan.highlight ? "" : "btn-ghost"} style={plan.highlight ? {
                  background: "#ffffff22", color: "#fff", border: "1px solid #ffffff44",
                  borderRadius: 9, padding: "10px 20px", width: "100%", fontFamily: "'Space Grotesk',sans-serif",
                  fontWeight: 600, fontSize: 13, cursor: "pointer", transition: "all .2s"
                } : { borderColor: border, color: text, width: "100%" }}>{plan.cta}</button>
              </div>
            ))}
          </div>
        </Section>
      </section>

      {/* ── Support & FAQ ── */}
      <section id="support" style={{ padding: "80px 1.5rem", background: dark ? "#0c0c0e" : "#f0eeea" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <Section>
            <div style={{ textAlign: "center", marginBottom: 48 }}>
              <div className="section-label" style={{ color: accent, marginBottom: 12 }}>Support</div>
              <h2 style={{ fontFamily: "'Fraunces',serif", fontWeight: 900, fontSize: "clamp(1.8rem,4vw,3rem)", letterSpacing: "-.02em", color: text }}>
                We've got you <span className="gradient-text">covered</span>
              </h2>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40 }}>
              {/* FAQ */}
              <div>
                <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 16, color: text }}>Frequently Asked Questions</div>
                <input
                  className="input-field"
                  placeholder="Search FAQs…"
                  value={faqSearch}
                  onChange={e => setFaqSearch(e.target.value)}
                  style={{ background: surface, borderColor: border, color: text, marginBottom: 16 }}
                />
                <div style={{ borderTop: `1px solid ${border}` }}>
                  {filteredFaqs.length === 0 && (
                    <div style={{ padding: "20px 0", color: muted, fontSize: 13, textAlign: "center" }}>No results found.</div>
                  )}
                  {filteredFaqs.map((faq, i) => (
                    <div key={i} className="faq-item" style={{ borderColor: border }}>
                      <button className="faq-btn" style={{ color: text }} onClick={() => setFaqOpen(faqOpen === i ? null : i)}>
                        <span style={{ fontSize: 13, fontWeight: 600, paddingRight: 12 }}>{faq.q}</span>
                        <span className="faq-chevron" style={{ transform: faqOpen === i ? "rotate(180deg)" : "rotate(0deg)", color: accent, flexShrink: 0 }}>⌄</span>
                      </button>
                      {faqOpen === i && (
                        <div style={{ paddingBottom: 14, fontSize: 13, color: muted, lineHeight: 1.7, animation: "slideIn .25s ease" }}>{faq.a}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Ticket form */}
              <div>
                <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 16, color: text }}>Submit a Support Ticket</div>
                {ticketSent ? (
                  <div style={{ background: "#22c55e18", border: "1px solid #22c55e30", borderRadius: 12, padding: "24px", textAlign: "center" }}>
                    <div style={{ fontSize: "2rem", marginBottom: 8 }}>✅</div>
                    <div style={{ fontWeight: 700, color: "#22c55e", marginBottom: 4 }}>Ticket submitted!</div>
                    <div style={{ fontSize: 13, color: muted }}>We'll get back to you within 24 hours.</div>
                  </div>
                ) : (
                  <form onSubmit={handleTicket} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <input className="input-field" placeholder="Your name" required value={ticketForm.name} onChange={e => setTicketForm({ ...ticketForm, name: e.target.value })} style={{ background: surface, borderColor: border, color: text }} />
                    <input className="input-field" type="email" placeholder="Email address" required value={ticketForm.email} onChange={e => setTicketForm({ ...ticketForm, email: e.target.value })} style={{ background: surface, borderColor: border, color: text }} />
                    <input className="input-field" placeholder="Subject" required value={ticketForm.subject} onChange={e => setTicketForm({ ...ticketForm, subject: e.target.value })} style={{ background: surface, borderColor: border, color: text }} />
                    <textarea className="input-field" placeholder="Describe your issue…" rows={4} required value={ticketForm.message} onChange={e => setTicketForm({ ...ticketForm, message: e.target.value })} style={{ background: surface, borderColor: border, color: text, resize: "vertical" }} />
                    <button type="submit" className="btn-primary" style={{ width: "100%", padding: "12px" }}>Send ticket →</button>
                  </form>
                )}
              </div>
            </div>
          </Section>
        </div>
      </section>

      {/* ── Creator Modal trigger ── */}
      <section style={{ padding: "80px 1.5rem", maxWidth: 820, margin: "0 auto", textAlign: "center" }}>
        <Section>
          <div style={{ background: surface, border: `1px solid ${border}`, borderRadius: 20, padding: "48px 32px", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", inset: 0, background: `radial-gradient(circle at 60% 40%, ${accent}12, transparent 60%)`, pointerEvents: "none" }} />
            <div className="section-label" style={{ color: accent, marginBottom: 12 }}>Extensible Platform</div>
            <h2 style={{ fontFamily: "'Fraunces',serif", fontWeight: 900, fontSize: "clamp(1.6rem,3.5vw,2.6rem)", letterSpacing: "-.02em", color: text, marginBottom: 14 }}>
              Build your own <span className="gradient-text">research agents</span>
            </h2>
            <p style={{ color: muted, fontSize: "1rem", lineHeight: 1.7, maxWidth: 480, margin: "0 auto 28px" }}>
              The Creator Studio lets you define custom agent personalities, tools, and workflows — no boilerplate required.
            </p>
            <button className="btn-primary" onClick={() => setShowCreator(true)} style={{ padding: "13px 28px", fontSize: 14, boxShadow: "0 0 40px #0d948848" }}>
              Open Creator Studio →
            </button>
          </div>
        </Section>
      </section>

      {/* ── Footer ── */}
      <footer style={{ borderTop: `1px solid ${border}`, padding: "32px 1.5rem", background: dark ? "#08080a" : "#f8f7f4" }}>
        <div style={{ maxWidth: 960, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 26, height: 26, background: accent, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Fraunces',serif", fontWeight: 900, fontSize: 12, color: "#fff" }}>R</div>
            <span style={{ fontWeight: 700, fontSize: 14, color: text }}>ResearchOS</span>
          </div>
          <div style={{ display: "flex", gap: 20 }}>
            {["Privacy","Terms","Docs","Status"].map(l => (
              <a key={l} href="#" style={{ fontSize: 12, color: muted, textDecoration: "none", fontFamily: "'DM Mono',monospace", letterSpacing: ".04em" }}>{l}</a>
            ))}
          </div>
          <div style={{ fontSize: 11, fontFamily: "'DM Mono',monospace", color: dark ? "#3f3f46" : "#a1a1aa" }}>
            Built with LangChain · Groq · FastAPI · React
          </div>
        </div>
      </footer>

      {/* ── Creator Modal ── */}
      {showCreator && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowCreator(false)}>
          <div className="modal-box" style={{ background: dark ? "#111113" : "#fff", borderColor: border }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <div>
                <div className="section-label" style={{ color: accent, marginBottom: 6 }}>Creator Studio</div>
                <h3 style={{ fontFamily: "'Fraunces',serif", fontWeight: 900, fontSize: "1.5rem", color: text }}>Build a Custom Agent</h3>
              </div>
              <button onClick={() => setShowCreator(false)} style={{ background: surface2, border: `1px solid ${border}`, borderRadius: 8, width: 32, height: 32, cursor: "pointer", color: muted, fontSize: 16 }}>✕</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, color: muted, display: "block", marginBottom: 6, fontFamily: "'DM Mono',monospace", letterSpacing: ".06em" }}>AGENT NAME</label>
                <input className="input-field" placeholder="e.g. Market Analyst" style={{ background: surface2, borderColor: border, color: text }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: muted, display: "block", marginBottom: 6, fontFamily: "'DM Mono',monospace", letterSpacing: ".06em" }}>SYSTEM PROMPT</label>
                <textarea className="input-field" rows={3} placeholder="You are a specialized agent that…" style={{ background: surface2, borderColor: border, color: text, resize: "vertical" }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: muted, display: "block", marginBottom: 8, fontFamily: "'DM Mono',monospace", letterSpacing: ".06em" }}>TOOLS</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {["web_search","scrape_url","pdf_read","compose_report","fact_check","news_fetch"].map(tool => (
                    <label key={tool} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer", padding: "5px 10px", background: surface, border: `1px solid ${border}`, borderRadius: 8, color: muted, fontFamily: "'DM Mono',monospace" }}>
                      <input type="checkbox" style={{ accentColor: accent }} /> {tool}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label style={{ fontSize: 12, color: muted, display: "block", marginBottom: 6, fontFamily: "'DM Mono',monospace", letterSpacing: ".06em" }}>BASE MODEL</label>
                <select className="input-field" style={{ background: surface2, borderColor: border, color: text }}>
                  <option>llama-3.1-70b-versatile</option>
                  <option>mixtral-8x7b-32768</option>
                  <option>llama-3.1-8b-instant</option>
                </select>
              </div>
              <button className="btn-primary" style={{ width: "100%", padding: "12px", marginTop: 8 }}>Deploy Agent →</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PipelineFlow({ dark, surface, border, muted }) {
  const [active, setActive] = useState(null);
  const steps = [
    { key: "search", label: "Search", icon: "⌕", color: "#f59e0b", desc: "Finds sources" },
    { key: "reader", label: "Reader", icon: "◈", color: "#14b8a6", desc: "Extracts content" },
    { key: "writer", label: "Writer", icon: "✦", color: "#6366f1", desc: "Synthesizes" },
    { key: "critic", label: "Critic", icon: "◉", color: "#22c55e", desc: "Validates" },
  ];

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, padding: "16px 24px", background: surface, border: `1px solid ${border}`, borderRadius: 16, position: "relative" }}>
      <div style={{ position: "absolute", top: 8, left: 20, fontSize: 9, fontFamily: "'DM Mono',monospace", color: muted, letterSpacing: ".1em" }}>AGENT PIPELINE</div>
      <div style={{ display: "flex", alignItems: "center", gap: 0, marginTop: 16 }}>
        {steps.map((s, idx) => (
          <div key={s.key} style={{ display: "flex", alignItems: "center" }}>
            <div className="pipeline-node" onClick={() => setActive(active === s.key ? null : s.key)} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <div style={{ width: 46, height: 46, borderRadius: 12, background: s.color + "18", border: `2px solid ${active === s.key ? s.color : s.color + "40"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.2rem", color: s.color, transition: "all .25s", boxShadow: active === s.key ? `0 0 20px ${s.color}40` : "none" }}>
                {s.icon}
              </div>
              <span style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: active === s.key ? s.color : muted, letterSpacing: ".06em" }}>{s.label}</span>
              {active === s.key && (
                <div style={{ position: "absolute", top: "100%", marginTop: 8, background: dark ? "#18181b" : "#fff", border: `1px solid ${s.color}40`, borderRadius: 8, padding: "6px 12px", fontSize: 11, color: s.color, whiteSpace: "nowrap", fontFamily: "'DM Mono',monospace", zIndex: 10 }}>{s.desc}</div>
              )}
            </div>
            {idx < steps.length - 1 && (
              <div style={{ display: "flex", alignItems: "center", margin: "0 4px 16px" }}>
                <div style={{ height: 1, width: 28, background: `linear-gradient(90deg, ${s.color}60, ${steps[idx+1].color}60)` }} />
                <div style={{ width: 0, height: 0, borderTop: "4px solid transparent", borderBottom: "4px solid transparent", borderLeft: `5px solid ${steps[idx+1].color}60` }} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}