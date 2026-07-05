import { useState, useEffect, useRef, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Zap, Link2, Cpu, Brain, Github } from 'lucide-react'
import Logo from '../components/Logo'

/* ══════════════════════════════════════════════════════════════
   DESIGN TOKENS — "night desk" / "daylight desk"
   No blue, no violet, no glow-orbs. Four earth-toned agent colors
   (amber / teal / rust / brick) do all the accent work — the same
   four hues that make up the logo mark itself.
══════════════════════════════════════════════════════════════ */
const T = {
  dark: {
    bg:           '#0E0D0B',
    bgCard:       '#1D1A13',
    bgElevated:   '#18160F',
    border:       'rgba(237,230,216,0.10)',
    borderMid:    'rgba(237,230,216,0.18)',
    borderHov:    'rgba(226,163,59,0.55)',
    text:         '#EDE6D8',
    textSub:      'rgba(237,230,216,0.64)',
    textMuted:    'rgba(237,230,216,0.40)',
    accent:       '#E2A33B',   // Search — primary
    accentB:      '#4C9C8E',   // Reader
    accentWarm:   '#C46A3B',   // Writer
    accentViolet: '#C1495A',   // Critic (key name kept for parity; color is brick, not violet)
    accentGreen:  '#4C9C8E',
    accentGlow:   'rgba(226,163,59,0.14)',
    navBg:        'rgba(14,13,11,0.92)',
    dotGrain:     'rgba(237,230,216,0.055)',
    pill:         'rgba(226,163,59,0.12)',
    pillBorder:   'rgba(226,163,59,0.30)',
    pillText:     '#E2A33B',
    shadow:       '0 24px 70px -24px rgba(0,0,0,0.55)',
    shadowCard:   '0 2px 14px rgba(0,0,0,0.28)',
    navLink:      'rgba(237,230,216,0.72)',
    isDark:       true,
  },
  light: {
    bg:           '#EFE9DA',
    bgCard:       '#FFFFFF',
    bgElevated:   '#F7F2E7',
    border:       'rgba(23,20,13,0.10)',
    borderMid:    'rgba(23,20,13,0.16)',
    borderHov:    'rgba(198,130,31,0.50)',
    text:         '#17140D',
    textSub:      'rgba(23,20,13,0.66)',
    textMuted:    'rgba(23,20,13,0.44)',
    accent:       '#C6821F',
    accentB:      '#2F7A6C',
    accentWarm:   '#A8532A',
    accentViolet: '#A3384A',
    accentGreen:  '#2F7A6C',
    accentGlow:   'rgba(198,130,31,0.12)',
    navBg:        'rgba(239,233,218,0.92)',
    dotGrain:     'rgba(23,20,13,0.05)',
    pill:         'rgba(198,130,31,0.10)',
    pillBorder:   'rgba(198,130,31,0.26)',
    pillText:     '#A5701A',
    shadow:       '0 24px 70px -28px rgba(23,20,13,0.20)',
    shadowCard:   '0 1px 3px rgba(23,20,13,0.07)',
    navLink:      'rgba(23,20,13,0.70)',
    isDark:       false,
  }
}

/* ══════ DATA ══════ */
function agentColors(t) {
  return { search: t.accent, reader: t.accentB, writer: t.accentWarm, critic: t.accentViolet }
}

const AGENT_DEFS = [
  { key:'search', icon:'◎', label:'Search Agent', hue:'search', desc:'Formulates smart queries and finds the most authoritative, recent sources using Tavily AI.', tool:'web_search' },
  { key:'reader', icon:'◈', label:'Reader Agent', hue:'reader', desc:'Picks the highest-quality URL, scrapes full-page content, and extracts structured information.', tool:'scrape_url' },
  { key:'writer', icon:'◆', label:'Writer Agent', hue:'writer', desc:'Synthesizes every source into a structured report — headings, analysis, inline citations.', tool:'llm_chain' },
  { key:'critic', icon:'◉', label:'Critic Agent', hue:'critic', desc:'Reviews coverage and accuracy, scores the report out of ten, and flags what is missing.', tool:'evaluation' },
]

const MODULE_DEFS = [
  { icon:'⬡', title:'Topic Research', tag:'Multi-Agent', hue:'search', desc:'Four specialized agents collaborate in real time to produce a cited, scored research report on any topic.' },
  { icon:'⬡', title:'PDF Chat',       tag:'RAG',         hue:'critic', desc:'Upload any document and ask questions. Answers come with page-level citations from a vector index.' },
  { icon:'⬡', title:'News Intel',     tag:'Live Feed',   hue:'writer', desc:'AI-summarized briefings — Key Developments, Context, and What to Watch — pulled from the latest sources.' },
  { icon:'⬡', title:'AI Dashboard',   tag:'Real-time',   hue:'reader', desc:'Weather intelligence, travel safety scores, and live headlines, plus a conversational agent over all three.' },
]

const STATS = [
  { value:'4',    label:'Specialized Agents', sub:'in the pipeline'   },
  { value:'21',   label:'API Endpoints',       sub:'fully protected'   },
  { value:'500+', label:'PDF Pages',           sub:'supported per doc' },
  { value:'<2s',  label:'First Token',         sub:'Groq LPU speed'    },
]

const FAQS = [
  { q:'What models power ResearchOS?',   a:'ResearchOS runs on Groq\'s ultra-fast LPU hardware using LLaMA 3.3 70B for all agent tasks, with automatic key rotation across multiple API keys so you never hit a rate limit.' },
  { q:'How does PDF chat work?',         a:'Your PDF is split into 1,000-character chunks with 200-character overlap, embedded with HuggingFace\'s all-MiniLM-L6-v2 model, and stored in ChromaDB. Each question retrieves the top-5 most relevant chunks as context.' },
  { q:'Is my data private?',             a:'All runs are scoped to your authenticated account. PDF sessions are isolated by session UUID and owner-verified on every request. Passwords are hashed with bcrypt — no plaintext credentials, ever.' },
  { q:'Can I use it without API keys?',  a:'Yes. Without keys, the system switches to simulation mode — a deterministic pipeline showing exactly how the multi-agent flow works, with realistic streaming delays and a sample report.' },
  { q:'How accurate is the research?',   a:'The Critic Agent scores every report out of 10 and flags weaknesses. Every report cites its sources. Treat ResearchOS as a powerful first-pass research assistant that gives you structured, sourced starting points.' },
  { q:'What file types can I upload?',   a:'Currently text-based PDFs only, up to 50MB and 500+ pages. Word documents, web URLs, and YouTube transcripts are on the roadmap.' },
]

const TECH_STACK = [
  { label:'LangChain',     sub:'bind_tools loop',   hue:'search' },
  { label:'Groq LPU',      sub:'~500 tok/s',        hue:'reader' },
  { label:'LLaMA 3.3 70B', sub:'writer + critic',   hue:'writer' },
  { label:'Tavily',        sub:'web + news search', hue:'critic' },
  { label:'ChromaDB',      sub:'vector store',      hue:'reader' },
  { label:'BeautifulSoup', sub:'html scraper',      hue:'writer' },
]

/* ══════ HOOKS ══════ */
function useInView(threshold = 0.1) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current; if (!el) return
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setVisible(true); obs.disconnect() }
    }, { threshold })
    obs.observe(el)
    return () => obs.disconnect()
  }, [threshold])
  return [ref, visible]
}

function useTyping(words, speed = 72, pause = 2100) {
  const [idx, setIdx] = useState(0)
  const [displayed, setDisplayed] = useState('')
  const [deleting, setDeleting] = useState(false)
  useEffect(() => {
    const word = words[idx]; let timer
    if (!deleting && displayed.length < word.length)
      timer = setTimeout(() => setDisplayed(word.slice(0, displayed.length + 1)), speed)
    else if (!deleting && displayed.length === word.length)
      timer = setTimeout(() => setDeleting(true), pause)
    else if (deleting && displayed.length > 0)
      timer = setTimeout(() => setDisplayed(displayed.slice(0, -1)), speed / 2.5)
    else { setDeleting(false); setIdx((idx + 1) % words.length) }
    return () => clearTimeout(timer)
  }, [displayed, deleting, idx, words, speed, pause])
  return displayed
}

/* ══════ REVEAL ══════ */
function Reveal({ children, delay = 0, y = 18 }) {
  const [ref, vis] = useInView()
  return (
    <div ref={ref} style={{
      opacity: vis ? 1 : 0,
      transform: vis ? 'translateY(0)' : `translateY(${y}px)`,
      transition: `opacity 0.6s cubic-bezier(0.16,1,0.3,1) ${delay}ms, transform 0.6s cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
    }}>{children}</div>
  )
}

/* ══════ SECTION HEADER ══════ */
function SectionHeader({ pill, title, accent, accentColor, sub, t }) {
  return (
    <div style={{ textAlign:'center', marginBottom:'3.5rem' }}>
      <span style={{
        display:'inline-flex', alignItems:'center', gap:7, padding:'5px 16px',
        borderRadius:99, background:t.pill, border:`1.5px solid ${t.pillBorder}`,
        fontSize:10.5, fontWeight:700, color:t.pillText,
        textTransform:'uppercase', letterSpacing:'0.12em', fontFamily:'var(--f-mono)',
        marginBottom:'1.1rem',
      }}>{pill}</span>
      <h2 style={{
        fontFamily:'var(--f-display)', fontSize:'clamp(2rem,4.5vw,3rem)',
        fontWeight:700, letterSpacing:'-0.02em', color:t.text,
        margin:'0 0 0.75rem', lineHeight:1.1,
      }}>
        {title}{' '}
        <span style={{ color: accentColor || t.accent }}>{accent}</span>
      </h2>
      {sub && <p style={{ fontSize:15, color:t.textSub, maxWidth:460, margin:'0 auto', lineHeight:1.7 }}>{sub}</p>}
    </div>
  )
}

/* ══════ PIPELINE DEMO ══════ */
function PipelineDemo({ t }) {
  const colors = agentColors(t)
  const [step, setStep] = useState(-1)
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(false)

  const run = useCallback(() => {
    if (running) return
    setRunning(true); setDone(false); setStep(0)
    let s = 0
    const advance = () => {
      if (s >= AGENT_DEFS.length) { setDone(true); setRunning(false); setStep(-1); return }
      setStep(s); s++; setTimeout(advance, 1250)
    }
    advance()
  }, [running])

  return (
    <div>
      <div className="pipeline-grid">
        {AGENT_DEFS.map((agent, i) => {
          const color = colors[agent.hue]
          const isActive = running && step === i
          const isDone   = done || (running && step > i)
          return (
            <div key={agent.key} style={{ display:'flex', alignItems:'center' }}>
              <div className="pipeline-card" style={{
                flex:1, padding:'1.4rem',
                background: isActive ? `${color}14` : isDone ? `${color}0a` : t.bgCard,
                border: `1.5px solid ${isActive ? color+'80' : isDone ? color+'45' : t.border}`,
                borderRadius:14,
                transition:'all 0.35s cubic-bezier(0.16,1,0.3,1)',
                boxShadow: isActive ? `0 0 0 3px ${color}25` : t.shadowCard,
                transform: isActive ? 'translateY(-6px)' : isDone ? 'translateY(-2px)' : 'none',
                position:'relative', overflow:'hidden',
              }}>
                <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background: isDone||isActive ? color : 'transparent', transition:'background 0.35s' }} />
                {isActive && (
                  <div style={{ position:'absolute', bottom:0, left:0, right:0, height:2, background:t.border }}>
                    <div style={{ height:'100%', background:color, animation:'progressBar 1.25s linear forwards' }} />
                  </div>
                )}
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'0.75rem', paddingTop:'0.35rem' }}>
                  <div style={{ width:40, height:40, borderRadius:9, background:`${color}18`, border:`1.5px solid ${color}40`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.1rem', color, flexShrink:0 }}>{agent.icon}</div>
                  <div style={{ fontSize:9.5, fontFamily:'var(--f-mono)', padding:'3px 10px', borderRadius:99, background: isDone ? `${t.accentGreen}16` : isActive ? `${color}18` : t.bgElevated, color: isDone ? t.accentGreen : isActive ? color : t.textMuted, border:`1px solid ${isDone ? t.accentGreen+'40' : isActive ? color+'40' : t.border}` }}>
                    {isDone ? '✓ done' : isActive ? '● live' : '○ queue'}
                  </div>
                </div>
                <div style={{ fontSize:9.5, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.1em', color, fontFamily:'var(--f-mono)', marginBottom:3 }}>{agent.key}</div>
                <div style={{ fontFamily:'var(--f-display)', fontWeight:700, fontSize:15, color:t.text, marginBottom:'0.5rem' }}>{agent.label}</div>
                <div style={{ fontSize:12.5, color:t.textSub, lineHeight:1.6, marginBottom:'0.85rem' }}>{agent.desc}</div>
                <div style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'3px 9px', background:t.bgElevated, border:`1px solid ${t.border}`, borderRadius:5 }}>
                  <span style={{ fontSize:9, color:t.textMuted, fontFamily:'var(--f-mono)' }}>tool:</span>
                  <span style={{ fontSize:9, color, fontFamily:'var(--f-mono)', fontWeight:600 }}>{agent.tool}</span>
                </div>
              </div>
              {i < AGENT_DEFS.length - 1 && (
                <div className="pipeline-arrow" style={{ width:28, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, gap:2 }}>
                  <div style={{ flex:1, height:1.5, background: (done||(running&&step>i)) ? `${colors[agent.hue]}80` : t.border, transition:'background 0.4s' }} />
                  <span style={{ fontSize:8, color:(done||(running&&step>i)) ? colors[agent.hue] : t.textMuted, transition:'color 0.4s' }}>▶</span>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div style={{ textAlign:'center', marginTop:'2.5rem' }}>
        <button onClick={run} disabled={running} className="btn-run" style={{
          padding:'12px 38px', borderRadius:8,
          background: done ? `${t.accentGreen}14` : running ? t.bgElevated : t.pill,
          color: done ? t.accentGreen : running ? t.textMuted : t.accent,
          border:`1.5px solid ${done ? t.accentGreen+'45' : running ? t.border : t.pillBorder}`,
          fontFamily:'var(--f-display)', fontWeight:700, fontSize:14, cursor:running?'not-allowed':'pointer',
          transition:'all 0.25s',
        }}>
          {done ? '✓ Complete — Run Again' : running ? `Running agent ${step+1} of 4…` : '▶  Run Pipeline Demo'}
        </button>
      </div>
    </div>
  )
}

/* ══════ CREATOR MODAL ══════ */
function CreatorModal({ open, onClose, t }) {
  useEffect(() => {
    if (!open) return
    const h = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', h); document.body.style.overflow = '' }
  }, [open, onClose])

  if (!open) return null

  const stack = [
    { Icon: Zap,   label: 'FastAPI',   sub: 'Backend',  hue: 'writer' },
    { Icon: Link2, label: 'LangChain', sub: 'Agents',   hue: 'search' },
    { Icon: Cpu,   label: 'React',     sub: 'Frontend', hue: 'critic' },
    { Icon: Brain, label: 'Groq',      sub: 'LLM',      hue: 'reader' },
  ]
  const colors = agentColors(t)

  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:2000, background:'rgba(0,0,0,0.7)', backdropFilter:'blur(14px)', display:'flex', alignItems:'center', justifyContent:'center', padding:'1rem' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background:t.bgCard, border:`1px solid ${t.borderMid}`, borderRadius:16, maxWidth:560, width:'100%', overflow:'hidden', boxShadow:t.shadow, animation:'modalIn 0.28s cubic-bezier(0.34,1.56,0.64,1)' }}>
        <div style={{ padding:'1.6rem 1.8rem', textAlign:'center', borderBottom:`1px solid ${t.border}`, position:'relative' }}>
          <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background:t.accent }} />
          <div style={{ width:56, height:56, margin:'0 auto 0.9rem' }}>
            <Logo size={56} markOnly pulse={false} coreColor={t.text} hexColor={t.textMuted} colors={colors} />
          </div>
          <div style={{ fontFamily:'var(--f-display)', fontSize:'1.3rem', fontWeight:700, color:t.text }}>Pankaj Thakur</div>
          <div style={{ fontSize:13, color:t.textSub, marginTop:'0.25rem' }}>Creator of ResearchOS</div>
          <div style={{ marginTop:'0.45rem', fontSize:10, letterSpacing:'0.12em', color:t.textMuted, fontFamily:'var(--f-mono)' }}>MULTI-AGENT AI SYSTEMS</div>
        </div>

        <div style={{ padding:'1.4rem 1.8rem 1.8rem' }}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'0.65rem', marginBottom:'1rem' }}>
            {stack.map((item) => {
              const c = colors[item.hue]
              return (
                <div key={item.label} style={{ background:t.bgElevated, border:`1px solid ${c}30`, borderRadius:10, padding:'0.8rem', textAlign:'center' }}>
                  <div style={{ width:32, height:32, margin:'0 auto 0.45rem', borderRadius:8, background:`${c}16`, border:`1px solid ${c}35`, display:'flex', alignItems:'center', justifyContent:'center', color:c }}>
                    <item.Icon size={15} strokeWidth={2} />
                  </div>
                  <div style={{ fontSize:12, fontWeight:700, color:t.text, fontFamily:'var(--f-display)' }}>{item.label}</div>
                  <div style={{ fontSize:10, color:t.textSub, marginTop:2, fontFamily:'var(--f-mono)' }}>{item.sub}</div>
                </div>
              )
            })}
          </div>

          <div style={{ background:t.bgElevated, border:`1px solid ${t.border}`, borderRadius:10, padding:'1rem', marginBottom:'1rem', fontSize:13.5, color:t.textSub, lineHeight:1.7 }}>
            ResearchOS is a multi-agent AI research platform featuring autonomous workflows, PDF intelligence, live web research, and structured report generation.
          </div>

          <div style={{ display:'flex', gap:'0.65rem' }}>
            <button onClick={onClose} style={{ flex:1, padding:'11px', background:t.accent, color:'#1A1204', border:'none', borderRadius:8, fontFamily:'var(--f-display)', fontWeight:700, cursor:'pointer' }}>Close</button>
            <button onClick={() => window.open('https://github.com/pankaj0160', '_blank')} style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'11px 18px', background:'transparent', color:t.navLink, border:`1px solid ${t.border}`, borderRadius:8, fontFamily:'var(--f-display)', fontWeight:600, cursor:'pointer' }}>
              <Github size={14} /> GitHub
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ══════ SUPPORT PAGE ══════ */
function SupportPage({ t, onBack }) {
  const [search, setSearch] = useState('')
  const [openFaq, setOpenFaq] = useState(null)
  const [form, setForm] = useState({ name:'', email:'', category:'general', message:'' })
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const filtered = FAQS.filter(f =>
    f.q.toLowerCase().includes(search.toLowerCase()) ||
    f.a.toLowerCase().includes(search.toLowerCase())
  )

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.name || !form.email || !form.message) return
    setSubmitting(true)
    setTimeout(() => { setSubmitting(false); setSubmitted(true) }, 1200)
  }

  const inp = { padding:'11px 14px', background:t.bgElevated, border:`1.5px solid ${t.border}`, borderRadius:8, color:t.text, fontSize:13.5, fontFamily:'var(--f-body)', outline:'none', width:'100%', boxSizing:'border-box', transition:'border-color 0.2s' }

  return (
    <div style={{ minHeight:'100vh', background:t.bg, color:t.text, fontFamily:'var(--f-body)' }}>
      <div style={{ borderBottom:`1px solid ${t.border}`, padding:'0 1.5rem', height:58, display:'flex', alignItems:'center', gap:'1rem', background:t.navBg, backdropFilter:'blur(16px)', position:'sticky', top:0, zIndex:10 }}>
        <button onClick={onBack} style={{ background:'none', border:`1.5px solid ${t.border}`, borderRadius:7, padding:'5px 14px', color:t.navLink, fontSize:13, cursor:'pointer', fontFamily:'var(--f-display)', fontWeight:600 }}>← Back</button>
        <span style={{ fontFamily:'var(--f-display)', fontWeight:700, fontSize:15.5, color:t.text }}>Support Center</span>
      </div>
      <div style={{ maxWidth:860, margin:'0 auto', padding:'4.5rem 1.5rem' }}>
        <div style={{ textAlign:'center', marginBottom:'3.5rem' }}>
          <span style={{ display:'inline-flex', alignItems:'center', gap:7, padding:'5px 16px', borderRadius:99, background:t.pill, border:`1.5px solid ${t.pillBorder}`, fontSize:10.5, fontWeight:700, color:t.pillText, textTransform:'uppercase', letterSpacing:'0.12em', fontFamily:'var(--f-mono)', marginBottom:'1.1rem' }}>Help &amp; Support</span>
          <h1 style={{ fontFamily:'var(--f-display)', fontSize:'clamp(2.2rem,5.5vw,3.2rem)', fontWeight:700, color:t.text, margin:'1rem 0 0.75rem' }}>
            How can we <span style={{ color:t.accent }}>help?</span>
          </h1>
          <p style={{ fontSize:15, color:t.textSub, maxWidth:440, margin:'0 auto', lineHeight:1.75 }}>Search the FAQ or submit a ticket. We respond within 24 hours.</p>
        </div>

        <div style={{ position:'relative', maxWidth:520, margin:'0 auto 3rem' }}>
          <input
            type="text" placeholder="Search help articles…" value={search} onChange={e=>setSearch(e.target.value)}
            style={{ ...inp, padding:'13px 16px', fontSize:14, borderRadius:10 }}
            onFocus={e=>e.target.style.borderColor=t.accent} onBlur={e=>e.target.style.borderColor=t.border} />
        </div>

        <div style={{ marginBottom:'4rem' }}>
          <h2 style={{ fontFamily:'var(--f-display)', fontSize:'1.1rem', fontWeight:700, color:t.text, marginBottom:'1rem' }}>
            Frequently Asked {search && <span style={{ fontSize:12, color:t.textMuted, fontFamily:'var(--f-body)', fontWeight:400 }}>· {filtered.length} result{filtered.length!==1?'s':''}</span>}
          </h2>
          {filtered.map((faq, i) => (
            <div key={i} style={{ border:`1.5px solid ${openFaq===i ? t.borderHov : t.border}`, borderRadius:10, marginBottom:'0.5rem', background:openFaq===i ? t.bgCard : 'transparent', transition:'all 0.2s', overflow:'hidden' }}>
              <button onClick={()=>setOpenFaq(openFaq===i?null:i)} style={{ width:'100%', padding:'1rem 1.25rem', background:'none', border:'none', cursor:'pointer', display:'flex', justifyContent:'space-between', alignItems:'center', gap:'1rem', textAlign:'left' }}>
                <span style={{ fontFamily:'var(--f-display)', fontWeight:600, fontSize:14.5, color:t.text }}>{faq.q}</span>
                <span style={{ color:t.accent, fontSize:20, flexShrink:0, transform:openFaq===i?'rotate(45deg)':'none', transition:'transform 0.2s', fontWeight:300 }}>+</span>
              </button>
              {openFaq===i && <div style={{ padding:'0 1.25rem 1.15rem', fontSize:14, color:t.textSub, lineHeight:1.8 }}>{faq.a}</div>}
            </div>
          ))}
        </div>

        <div style={{ background:t.bgCard, border:`1.5px solid ${t.border}`, borderRadius:14, overflow:'hidden', boxShadow:t.shadow }}>
          <div style={{ borderBottom:`1.5px solid ${t.border}`, padding:'1.5rem 2rem' }}>
            <h2 style={{ fontFamily:'var(--f-display)', fontSize:'1.2rem', fontWeight:700, color:t.text }}>Submit a Ticket</h2>
            <p style={{ fontSize:13.5, color:t.textSub, marginTop:4 }}>Can't find an answer? We'll get back to you within 24 hours.</p>
          </div>
          <div style={{ padding:'2rem' }}>
            {submitted ? (
              <div style={{ textAlign:'center', padding:'2.5rem 0' }}>
                <div style={{ width:56, height:56, borderRadius:'50%', background:`${t.accentGreen}16`, border:`1.5px solid ${t.accentGreen}40`, display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 1.1rem', fontSize:'1.5rem', color:t.accentGreen }}>✓</div>
                <div style={{ fontFamily:'var(--f-display)', fontWeight:700, fontSize:'1.15rem', color:t.text, marginBottom:'0.4rem' }}>Ticket submitted!</div>
                <div style={{ fontSize:14, color:t.textSub }}>We'll respond to <strong style={{color:t.text}}>{form.email}</strong> within 24 hours.</div>
                <button onClick={()=>{ setSubmitted(false); setForm({name:'',email:'',category:'general',message:''}) }} style={{ marginTop:'1.5rem', padding:'10px 24px', background:t.accent, color:'#1A1204', border:'none', borderRadius:8, fontFamily:'var(--f-display)', fontWeight:700, fontSize:13.5, cursor:'pointer' }}>Submit Another</button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
                <div className="ticket-grid" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem' }}>
                  {[{key:'name',label:'Full Name',pl:'Your name',type:'text'},{key:'email',label:'Email Address',pl:'you@example.com',type:'email'}].map(f=>(
                    <div key={f.key}>
                      <label style={{ display:'block', fontSize:11, fontWeight:700, color:t.textSub, letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:'0.4rem', fontFamily:'var(--f-mono)' }}>{f.label}</label>
                      <input type={f.type} placeholder={f.pl} value={form[f.key]} onChange={e=>setForm(p=>({...p,[f.key]:e.target.value}))} required style={inp}
                        onFocus={e=>e.target.style.borderColor=t.accent} onBlur={e=>e.target.style.borderColor=t.border} />
                    </div>
                  ))}
                </div>
                <div>
                  <label style={{ display:'block', fontSize:11, fontWeight:700, color:t.textSub, letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:'0.4rem', fontFamily:'var(--f-mono)' }}>Category</label>
                  <select value={form.category} onChange={e=>setForm(p=>({...p,category:e.target.value}))} style={inp}>
                    {['general','bug','billing','feature','other'].map(c=><option key={c} value={c}>{c.charAt(0).toUpperCase()+c.slice(1)}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display:'block', fontSize:11, fontWeight:700, color:t.textSub, letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:'0.4rem', fontFamily:'var(--f-mono)' }}>Message</label>
                  <textarea placeholder="Describe your issue…" value={form.message} onChange={e=>setForm(p=>({...p,message:e.target.value}))} required rows={5}
                    style={{ ...inp, resize:'vertical', lineHeight:1.6 }}
                    onFocus={e=>e.target.style.borderColor=t.accent} onBlur={e=>e.target.style.borderColor=t.border} />
                </div>
                <button type="submit" disabled={submitting} style={{ padding:'13px', background:submitting?t.bgElevated:t.accent, color:submitting?t.textMuted:'#1A1204', border:`1.5px solid ${submitting?t.border:t.accent}`, borderRadius:9, fontFamily:'var(--f-display)', fontWeight:700, fontSize:14.5, cursor:submitting?'not-allowed':'pointer', transition:'all 0.2s' }}>
                  {submitting ? 'Submitting…' : 'Submit Ticket →'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   MAIN LANDING
══════════════════════════════════════════════════════════════ */
export default function Landing() {
  const { user }   = useAuth()
  const navigate   = useNavigate()
  const [theme, setTheme]         = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  )
  const [showCreator, setCreator] = useState(false)
  const [showSupport, setSupport] = useState(false)
  const [scrolled, setScrolled]   = useState(false)
  const [openFaq, setOpenFaq]     = useState(null)
  const [menuOpen, setMenuOpen]   = useState(false)
  const typed = useTyping(['any topic','any PDF','live news','anything'])
  const t = T[theme]
  const colors = agentColors(t)

  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', h, { passive:true })
    return () => window.removeEventListener('scroll', h)
  }, [])

  if (showSupport) return <SupportPage t={t} onBack={()=>setSupport(false)} />

  const C = { maxWidth:1100, margin:'0 auto', padding:'0 2rem' }

  return (
    <div style={{ minHeight:'100vh', background:t.bg, color:t.text, fontFamily:'var(--f-body)', overflowX:'hidden', transition:'background 0.3s ease, color 0.3s ease' }}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');
        :root {
          --f-display: 'Bricolage Grotesque', system-ui, sans-serif;
          --f-body:    'Inter', system-ui, sans-serif;
          --f-mono:    'JetBrains Mono', monospace;
        }
        *, *::before, *::after { box-sizing:border-box; }
        html { scroll-behavior: smooth; }
        body { -webkit-font-smoothing: antialiased; }

        @keyframes fadeUp      { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pulseDot    { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes modalIn     { from{opacity:0;transform:scale(0.94) translateY(10px)} to{opacity:1;transform:scale(1) translateY(0)} }
        @keyframes progressBar { from{width:0%} to{width:100%} }
        @keyframes blink       { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes statPop     { from{opacity:0;transform:scale(0.88)} to{opacity:1;transform:scale(1)} }

        .hov-card { transition: transform 0.28s cubic-bezier(0.16,1,0.3,1), box-shadow 0.28s, border-color 0.2s; }
        .hov-card:hover { transform: translateY(-4px); }

        .btn-cta { transition: transform 0.15s, box-shadow 0.15s, filter 0.15s; display:inline-flex; align-items:center; text-decoration:none; }
        .btn-cta:hover { transform:translateY(-1px); filter:brightness(1.05); }
        .btn-cta:active { transform:translateY(0); filter:brightness(0.97); }

        .nav-link { transition: color 0.18s, background 0.18s; text-decoration:none; font-family:var(--f-body); font-size:13.5px; font-weight:600; padding:6px 12px; border-radius:7px; cursor:pointer; border:none; background:transparent; }

        .pipeline-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:0.75rem; align-items:start; }
        .pipeline-arrow { display:flex; }
        .agents-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:0.85rem; }
        .modules-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:1rem; }

        @media (max-width: 1024px) {
          .pipeline-grid  { grid-template-columns: repeat(2, 1fr); }
          .pipeline-arrow { display:none; }
          .agents-grid    { grid-template-columns: repeat(2, 1fr); }
          .modules-grid   { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 640px) {
          .pipeline-grid  { grid-template-columns: 1fr; }
          .agents-grid    { grid-template-columns: 1fr; }
          .modules-grid   { grid-template-columns: 1fr; }
          .hero-ctas      { flex-direction: column; align-items: center; }
          .stats-row      { grid-template-columns: repeat(2,1fr); }
          .nav-center     { display: none !important; }
          .ticket-grid    { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 860px) { .nav-desktop-only { display:none !important; } }
        @media (min-width: 861px) { .nav-mobile-only  { display:none !important; } }
      `}</style>

      {/* ══════ NAVBAR ══════ */}
      <nav style={{
        position:'fixed', top:0, left:0, right:0, zIndex:300, height:60,
        background: scrolled || menuOpen ? t.navBg : 'transparent',
        backdropFilter: scrolled || menuOpen ? 'blur(20px)' : 'none',
        borderBottom:`1px solid ${scrolled || menuOpen ? t.border : 'transparent'}`,
        transition:'all 0.28s ease',
        display:'flex', alignItems:'center',
      }}>
        <div style={{ ...C, width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between' }}>

          <Logo size={30} wordmarkColor={t.text} osTagColor={t.accent} hexColor={t.textMuted} colors={colors} />

          <div className="nav-center" style={{ display:'flex', alignItems:'center', gap:'0.05rem', background:scrolled ? t.bgElevated : 'transparent', borderRadius:10, padding:scrolled?'4px':'0', border:scrolled?`1px solid ${t.border}`:'none', transition:'all 0.25s' }}>
            {['Features','Pipeline','Agents','FAQ'].map(item => (
              <a key={item} href={`#${item.toLowerCase()}`} className="nav-link" style={{ color: t.navLink }}
                onMouseEnter={e=>{ e.currentTarget.style.color=t.accent; e.currentTarget.style.background=t.pill }}
                onMouseLeave={e=>{ e.currentTarget.style.color=t.navLink; e.currentTarget.style.background='transparent' }}>
                {item}
              </a>
            ))}
            <button className="nav-link" onClick={()=>setSupport(true)} style={{ color:t.navLink }}
              onMouseEnter={e=>{ e.currentTarget.style.color=t.accent; e.currentTarget.style.background=t.pill }}
              onMouseLeave={e=>{ e.currentTarget.style.color=t.navLink; e.currentTarget.style.background='transparent' }}>
              Support
            </button>
          </div>

          <div className="nav-desktop-only" style={{ display:'flex', alignItems:'center', gap:'0.5rem', flexShrink:0 }}>
            <ThemeRocker isDark={t.isDark} onToggle={()=>setTheme(th=>th==='dark'?'light':'dark')} bgInset={t.bgElevated} border={t.border} thumbBg={t.bgCard} text={t.text} />

            {user ? (
              <button className="btn-cta" onClick={()=>navigate('/dashboard')} style={{ padding:'8px 18px', background:t.accent, color:'#1A1204', border:'none', borderRadius:8, fontFamily:'var(--f-display)', fontWeight:700, fontSize:13, cursor:'pointer' }}>
                Dashboard →
              </button>
            ) : (
              <>
                <Link to="/login" className="btn-cta" style={{ padding:'7px 16px', color:t.navLink, border:`1.5px solid ${t.border}`, borderRadius:8, fontFamily:'var(--f-display)', fontWeight:600, fontSize:13 }}>
                  Sign in
                </Link>
                <Link to="/register" className="btn-cta" style={{ padding:'8px 18px', background:t.accent, color:'#1A1204', borderRadius:8, fontFamily:'var(--f-display)', fontWeight:700, fontSize:13 }}>
                  Get started
                </Link>
              </>
            )}
          </div>

          <button className="nav-mobile-only" onClick={()=>setMenuOpen(v=>!v)} aria-label="Menu" style={{ width:36, height:36, borderRadius:8, border:`1px solid ${t.border}`, background:t.bgElevated, color:t.text, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
            {menuOpen ? '✕' : '☰'}
          </button>
        </div>
      </nav>

      {menuOpen && (
        <div className="nav-mobile-only" style={{ position:'fixed', top:60, left:0, right:0, zIndex:299, background:t.navBg, backdropFilter:'blur(20px)', borderBottom:`1px solid ${t.border}`, padding:'0.5rem 2rem 1rem', display:'flex', flexDirection:'column' }}>
          {['Features','Pipeline','Agents','FAQ'].map(item => (
            <a key={item} href={`#${item.toLowerCase()}`} onClick={()=>setMenuOpen(false)} style={{ padding:'12px 0', borderBottom:`1px solid ${t.border}`, color:t.text, fontFamily:'var(--f-display)', fontWeight:600, fontSize:14.5 }}>{item}</a>
          ))}
          <button onClick={()=>{ setSupport(true); setMenuOpen(false) }} style={{ padding:'12px 0', textAlign:'left', background:'none', border:'none', borderBottom:`1px solid ${t.border}`, color:t.text, fontFamily:'var(--f-display)', fontWeight:600, fontSize:14.5 }}>Support</button>
          <div style={{ display:'flex', gap:'0.6rem', marginTop:'1rem' }}>
            <ThemeRocker isDark={t.isDark} onToggle={()=>setTheme(th=>th==='dark'?'light':'dark')} bgInset={t.bgElevated} border={t.border} thumbBg={t.bgCard} text={t.text} />
            {!user && <Link to="/register" onClick={()=>setMenuOpen(false)} style={{ flex:1, textAlign:'center', padding:'10px', background:t.accent, color:'#1A1204', borderRadius:8, fontFamily:'var(--f-display)', fontWeight:700, fontSize:13.5 }}>Get started</Link>}
          </div>
        </div>
      )}

      {/* ══════ HERO ══════ */}
      <section style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', position:'relative', overflow:'hidden', paddingTop:60 }}>
        {/* Instrument-panel dot grain — no glow orbs, no scan lines */}
        <div style={{
          position:'absolute', inset:0, pointerEvents:'none',
          backgroundImage:`radial-gradient(${t.dotGrain} 1px, transparent 1px)`,
          backgroundSize:'26px 26px',
          maskImage:'radial-gradient(ellipse 80% 65% at 50% 40%, black 35%, transparent 85%)',
          WebkitMaskImage:'radial-gradient(ellipse 80% 65% at 50% 40%, black 35%, transparent 85%)',
        }} />

        <div style={{ ...C, textAlign:'center', position:'relative', zIndex:1, padding:'2rem 2rem' }}>

          <span style={{
            display:'inline-flex', alignItems:'center', gap:8, padding:'5px 16px',
            borderRadius:99, background:t.pill, border:`1.5px solid ${t.pillBorder}`,
            fontSize:10.5, fontWeight:700, color:t.pillText,
            textTransform:'uppercase', letterSpacing:'0.12em', fontFamily:'var(--f-mono)',
            marginBottom:'1.75rem', animation:'fadeUp 0.5s ease both',
          }}>
            <span style={{ width:5, height:5, borderRadius:'50%', background:t.accent, animation:'pulseDot 2.2s ease-in-out infinite' }} />
            Multi-Agent Research Platform
          </span>

          <h1 style={{
            fontFamily:'var(--f-display)', fontSize:'clamp(2.8rem,8vw,5.6rem)',
            fontWeight:700, lineHeight:1.04, letterSpacing:'-0.03em',
            color:t.text, marginBottom:'1.5rem',
            animation:'fadeUp 0.55s ease 0.06s both',
          }}>
            Research<span style={{ color:t.accent }}>OS</span> for
            <br />
            <span style={{ color:t.text }}>{typed}</span>
            <span style={{ color:t.accent, animation:'blink 1.1s step-end infinite', fontWeight:300 }}>|</span>
          </h1>

          <p style={{ fontSize:'clamp(1rem,2.2vw,1.15rem)', color:t.textSub, maxWidth:540, margin:'0 auto 2.75rem', lineHeight:1.75, animation:'fadeUp 0.55s ease 0.13s both' }}>
            Ask any topic, upload a PDF, or track a news story. Specialized AI agents research, write, and critique — returning a structured report in real time.
          </p>

          <div className="hero-ctas" style={{ display:'flex', gap:'0.75rem', justifyContent:'center', marginBottom:'3.5rem', animation:'fadeUp 0.55s ease 0.2s both', flexWrap:'wrap' }}>
            {user ? (
              <button className="btn-cta" onClick={()=>navigate('/research')} style={{ padding:'15px 34px', background:t.accent, color:'#1A1204', border:'none', borderRadius:10, fontFamily:'var(--f-display)', fontWeight:700, fontSize:15.5, cursor:'pointer' }}>
                Open workspace →
              </button>
            ) : (
              <>
                <Link to="/register" className="btn-cta" style={{ padding:'15px 34px', background:t.accent, color:'#1A1204', borderRadius:10, fontFamily:'var(--f-display)', fontWeight:700, fontSize:15.5 }}>
                  Start for free →
                </Link>
                <Link to="/login" className="btn-cta" style={{ padding:'15px 26px', borderRadius:10, border:`1.5px solid ${t.border}`, color:t.navLink, fontFamily:'var(--f-display)', fontWeight:600, fontSize:14 }}>
                  Sign in
                </Link>
              </>
            )}
            <button className="btn-cta" onClick={()=>setCreator(true)} style={{ padding:'15px 26px', borderRadius:10, border:`1.5px solid ${t.border}`, color:t.navLink, fontFamily:'var(--f-display)', fontWeight:600, fontSize:14, background:'none', cursor:'pointer' }}>
              About the creator
            </button>
          </div>

          <div className="stats-row" style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'0.65rem', maxWidth:620, margin:'0 auto', animation:'fadeUp 0.55s ease 0.28s both' }}>
            {STATS.map((s, i) => (
              <div key={s.value} style={{ padding:'14px 16px', background:t.bgCard, border:`1.5px solid ${t.border}`, borderRadius:10, textAlign:'center', boxShadow:t.shadowCard, animation:`statPop 0.45s ease ${0.34+i*0.06}s both` }}>
                <div style={{ fontFamily:'var(--f-display)', fontSize:'1.7rem', fontWeight:700, color:t.accent, letterSpacing:'-0.03em', lineHeight:1 }}>{s.value}</div>
                <div style={{ fontSize:12, fontWeight:600, color:t.text, marginTop:4, lineHeight:1.3 }}>{s.label}</div>
                <div style={{ fontSize:9.5, color:t.textMuted, fontFamily:'var(--f-mono)', marginTop:2 }}>{s.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════ PIPELINE ══════ */}
      <section id="pipeline" style={{ padding:'6.5rem 0', borderTop:`1px solid ${t.border}`, background:t.isDark?'rgba(255,255,255,0.012)':'rgba(0,0,0,0.015)' }}>
        <div style={C}>
          <Reveal>
            <SectionHeader pill="Live Pipeline" title="Watch the agents" accent="collaborate" accentColor={t.accent} sub="Click Run to see all four agents execute in sequence. Each step passes its output to the next." t={t} />
          </Reveal>
          <Reveal delay={90}><PipelineDemo t={t} /></Reveal>
        </div>
      </section>

      {/* ══════ FEATURES / MODULES ══════ */}
      <section id="features" style={{ padding:'6.5rem 0', borderTop:`1px solid ${t.border}` }}>
        <div style={C}>
          <Reveal>
            <SectionHeader pill="Four Modules" title="Everything in" accent="one workspace" accentColor={t.accentWarm} sub="Four intelligence modules sharing a single design system and auth layer." t={t} />
          </Reveal>
          <div className="modules-grid">
            {MODULE_DEFS.map((m, i) => {
              const color = colors[m.hue]
              return (
                <Reveal key={m.title} delay={i * 55}>
                  <div className="hov-card" style={{ background:t.bgCard, border:`1.5px solid ${t.border}`, borderRadius:14, padding:'1.75rem', height:'100%', cursor:'default', boxShadow:t.shadowCard, position:'relative', overflow:'hidden' }}
                    onMouseEnter={e=>{ e.currentTarget.style.borderColor=`${color}60` }}
                    onMouseLeave={e=>{ e.currentTarget.style.borderColor=t.border }}>
                    <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background:color }} />
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.1rem', paddingTop:'0.4rem' }}>
                      <span style={{ fontSize:'1.5rem', color }}>{m.icon}</span>
                      <span style={{ fontSize:9.5, fontWeight:700, padding:'3px 10px', borderRadius:99, background:`${color}15`, color, border:`1.5px solid ${color}40`, fontFamily:'var(--f-mono)', letterSpacing:'0.07em' }}>{m.tag}</span>
                    </div>
                    <div style={{ fontFamily:'var(--f-display)', fontWeight:700, fontSize:17, color:t.text, marginBottom:'0.55rem' }}>{m.title}</div>
                    <div style={{ fontSize:13.5, color:t.textSub, lineHeight:1.7 }}>{m.desc}</div>
                  </div>
                </Reveal>
              )
            })}
          </div>
        </div>
      </section>

      {/* ══════ AGENTS ══════ */}
      <section id="agents" style={{ padding:'6.5rem 0', borderTop:`1px solid ${t.border}`, background:t.isDark?'rgba(255,255,255,0.012)':'rgba(0,0,0,0.015)' }}>
        <div style={C}>
          <Reveal>
            <SectionHeader pill="Agent Architecture" title="Meet the" accent="agent team" accentColor={t.accentViolet} sub="Each agent has a specialized role, passing typed results down the chain — order matters." t={t} />
          </Reveal>

          <div className="agents-grid">
            {AGENT_DEFS.map((agent, i) => {
              const color = colors[agent.hue]
              return (
                <Reveal key={agent.key} delay={i * 55}>
                  <div className="hov-card" style={{ background:t.bgCard, border:`1.5px solid ${t.border}`, borderRadius:14, padding:'1.6rem', cursor:'default', height:'100%', boxShadow:t.shadowCard, position:'relative', overflow:'hidden' }}
                    onMouseEnter={e=>{ e.currentTarget.style.borderColor=`${color}65` }}
                    onMouseLeave={e=>{ e.currentTarget.style.borderColor=t.border }}>
                    <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background:color, opacity:0.8 }} />
                    <div style={{ fontSize:9.5, fontFamily:'var(--f-mono)', color:t.textMuted, letterSpacing:'0.08em', marginBottom:8, paddingTop:'0.5rem' }}>0{i+1} / {agent.key.toUpperCase()}</div>
                    <div style={{ display:'flex', alignItems:'flex-start', gap:'0.85rem', marginBottom:'0.9rem' }}>
                      <div style={{ width:44, height:44, borderRadius:10, background:`${color}18`, border:`1.5px solid ${color}45`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.15rem', color, flexShrink:0 }}>{agent.icon}</div>
                      <div>
                        <div style={{ fontFamily:'var(--f-display)', fontWeight:700, fontSize:15.5, color:t.text }}>{agent.label}</div>
                      </div>
                    </div>
                    <p style={{ fontSize:13.5, color:t.textSub, lineHeight:1.7, marginBottom:'1rem' }}>{agent.desc}</p>
                    <div style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'4px 10px', background:t.bgElevated, border:`1.5px solid ${t.border}`, borderRadius:6 }}>
                      <span style={{ fontSize:9.5, color:t.textMuted, fontFamily:'var(--f-mono)' }}>tool:</span>
                      <span style={{ fontSize:9.5, color, fontFamily:'var(--f-mono)', fontWeight:600 }}>{agent.tool}</span>
                    </div>
                  </div>
                </Reveal>
              )
            })}
          </div>

          <Reveal delay={200}>
            <div style={{ marginTop:'1.5rem', padding:'1.5rem 2rem', background:t.bgCard, border:`1.5px solid ${t.border}`, borderRadius:14, display:'flex', flexWrap:'wrap', gap:'0.65rem', alignItems:'center', justifyContent:'center', boxShadow:t.shadowCard }}>
              {TECH_STACK.map(item => {
                const color = colors[item.hue]
                return (
                  <div key={item.label} style={{ display:'flex', alignItems:'center', gap:7, padding:'6px 13px', background:t.bgElevated, border:`1.5px solid ${color}28`, borderRadius:8, transition:'border-color 0.2s' }}
                    onMouseEnter={e=>e.currentTarget.style.borderColor=`${color}55`}
                    onMouseLeave={e=>e.currentTarget.style.borderColor=`${color}28`}>
                    <span style={{ width:6, height:6, borderRadius:'50%', background:color, flexShrink:0 }} />
                    <span style={{ fontSize:13, fontWeight:600, color:t.text, fontFamily:'var(--f-display)' }}>{item.label}</span>
                    <span style={{ fontSize:10, color:t.textMuted, fontFamily:'var(--f-mono)' }}>· {item.sub}</span>
                  </div>
                )
              })}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ══════ FAQ ══════ */}
      <section id="faq" style={{ padding:'6.5rem 0', borderTop:`1px solid ${t.border}` }}>
        <div style={{ ...C, maxWidth:760 }}>
          <Reveal>
            <SectionHeader pill="FAQ" title="Frequently asked" accent="questions" accentColor={t.accentGreen} sub="Everything you need to know about ResearchOS." t={t} />
          </Reveal>
          <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
            {FAQS.map((faq, i) => (
              <Reveal key={i} delay={i * 42}>
                <div style={{ border:`1.5px solid ${openFaq===i ? t.borderHov : t.border}`, borderRadius:10, background:openFaq===i ? t.bgCard : 'transparent', overflow:'hidden', transition:'all 0.2s' }}>
                  <button onClick={()=>setOpenFaq(openFaq===i?null:i)} style={{ width:'100%', padding:'1.05rem 1.3rem', background:'none', border:'none', cursor:'pointer', display:'flex', justifyContent:'space-between', alignItems:'center', gap:'1rem', textAlign:'left' }}>
                    <span style={{ fontFamily:'var(--f-display)', fontWeight:600, fontSize:15, color:t.text }}>{faq.q}</span>
                    <span style={{ color:t.accent, fontSize:22, flexShrink:0, transform:openFaq===i?'rotate(45deg)':'none', transition:'transform 0.22s', fontWeight:300, lineHeight:1 }}>+</span>
                  </button>
                  {openFaq===i && <div style={{ padding:'0 1.3rem 1.2rem', fontSize:14.5, color:t.textSub, lineHeight:1.8 }}>{faq.a}</div>}
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ══════ CTA BANNER ══════ */}
      <section style={{ padding:'6rem 0', borderTop:`1px solid ${t.border}`, position:'relative', overflow:'hidden' }}>
        <div style={{ ...C, textAlign:'center', position:'relative', zIndex:1 }}>
          <Reveal>
            <div style={{ maxWidth:600, margin:'0 auto' }}>
              <h2 style={{ fontFamily:'var(--f-display)', fontSize:'clamp(2.2rem,4.5vw,3.6rem)', fontWeight:700, color:t.text, marginBottom:'1rem', lineHeight:1.1 }}>
                Open your research
                <br />
                <span style={{ color: t.accent }}>workspace</span>{' '}
                <span style={{ color: t.accentViolet }}>today.</span>
              </h2>
              <p style={{ fontSize:15, color:t.textSub, marginBottom:'2.5rem', lineHeight:1.75 }}>
                Free to start. No credit card required. All four modules available from day one.
              </p>
              <div className="hero-ctas" style={{ display:'flex', gap:'0.75rem', justifyContent:'center', flexWrap:'wrap' }}>
                {user ? (
                  <button className="btn-cta" onClick={()=>navigate('/dashboard')} style={{ padding:'15px 34px', background:t.accent, color:'#1A1204', border:'none', borderRadius:10, fontFamily:'var(--f-display)', fontWeight:700, fontSize:15.5, cursor:'pointer' }}>
                    Go to dashboard →
                  </button>
                ) : (
                  <>
                    <Link to="/register" className="btn-cta" style={{ padding:'15px 34px', background:t.accent, color:'#1A1204', borderRadius:10, fontFamily:'var(--f-display)', fontWeight:700, fontSize:15.5 }}>
                      Create free account →
                    </Link>
                    <button className="btn-cta" onClick={()=>setSupport(true)} style={{ padding:'15px 26px', border:`1.5px solid ${t.border}`, borderRadius:10, color:t.navLink, fontFamily:'var(--f-display)', fontWeight:600, fontSize:14, background:'none', cursor:'pointer' }}>
                      Contact support
                    </button>
                  </>
                )}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ══════ FOOTER ══════ */}
      <footer style={{ borderTop:`1px solid ${t.border}`, padding:'2.5rem 2rem', background:t.isDark?'rgba(0,0,0,0.35)':'rgba(0,0,0,0.02)' }}>
        <div style={{ maxWidth:1100, margin:'0 auto', display:'flex', flexWrap:'wrap', alignItems:'center', justifyContent:'space-between', gap:'1rem' }}>
          <Logo size={24} wordmarkColor={t.text} osTagColor={t.accent} hexColor={t.textMuted} colors={colors} />
          <div style={{ display:'flex', gap:'0.1rem', flexWrap:'wrap' }}>
            {[{label:'Features',href:'#features'},{label:'Pipeline',href:'#pipeline'},{label:'FAQ',href:'#faq'},{label:'Support',onClick:()=>setSupport(true)},{label:'Creator',onClick:()=>setCreator(true)}].map(item=>(
              item.href
                ? <a key={item.label} href={item.href} className="nav-link" style={{ color:t.textMuted, fontSize:12.5 }}>{item.label}</a>
                : <button key={item.label} className="nav-link" onClick={item.onClick} style={{ color:t.textMuted, fontSize:12.5 }}>{item.label}</button>
            ))}
          </div>
          <span style={{ fontSize:10.5, color:t.textMuted, fontFamily:'var(--f-mono)' }}>FastAPI · LangChain · Groq · ChromaDB · React</span>
        </div>
      </footer>

      <CreatorModal open={showCreator} onClose={()=>setCreator(false)} t={t} />
    </div>
  )
}

/* ══════ small local theme rocker (kept local since Landing.jsx is JS-state-themed, not CSS-var-themed) ══════ */
function ThemeRocker({ isDark, onToggle, border, bgInset, thumbBg, text }) {
  return (
    <button
      onClick={onToggle}
      role="switch"
      aria-checked={!isDark}
      aria-label="Toggle light and dark theme"
      style={{
        position:'relative', display:'inline-flex', alignItems:'center',
        width:52, height:28, borderRadius:20,
        background:bgInset, border:`1px solid ${border}`,
        padding:2, cursor:'pointer', flexShrink:0,
      }}
    >
      <span style={{
        width:22, height:22, borderRadius:'50%', background:thumbBg, color:text,
        display:'flex', alignItems:'center', justifyContent:'center',
        transform: isDark ? 'translateX(0)' : 'translateX(24px)',
        transition:'transform 0.26s cubic-bezier(0.4,0,0.2,1)',
        boxShadow:'0 1px 3px rgba(0,0,0,0.3)',
      }}>
        {isDark ? (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4.3"/><line x1="12" y1="2.5" x2="12" y2="4.3"/><line x1="12" y1="19.7" x2="12" y2="21.5"/><line x1="2.5" y1="12" x2="4.3" y2="12"/><line x1="19.7" y1="12" x2="21.5" y2="12"/><line x1="5.3" y1="5.3" x2="6.6" y2="6.6"/><line x1="17.4" y1="17.4" x2="18.7" y2="18.7"/><line x1="5.3" y1="18.7" x2="6.6" y2="17.4"/><line x1="17.4" y1="6.6" x2="18.7" y2="5.3"/></svg>
        )}
      </span>
    </button>
  )
}