import { useState, useEffect, useRef, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/* ══════════════════════════════════════════════════════════════
   DESIGN TOKENS — balanced dark/light, high contrast both ways
══════════════════════════════════════════════════════════════ */
const T = {
  dark: {
    bg:           '#070b14',
    bgCard:       '#0d1220',
    bgElevated:   '#131929',
    bgGlass:      'rgba(13,18,32,0.92)',
    border:       'rgba(255,255,255,0.09)',
    borderMid:    'rgba(255,255,255,0.17)',
    borderHov:    'rgba(82,153,255,0.55)',
    text:         '#eef2ff',
    textSub:      '#8895c4',
    textMuted:    '#404870',
    accent:       '#4f8ef7',
    accentB:      '#6ea3ff',
    accentWarm:   '#f59e0b',
    accentViolet: '#9b72f7',
    accentGreen:  '#10d98c',
    accentGlow:   'rgba(79,142,247,0.2)',
    navBg:        'rgba(7,11,20,0.94)',
    gridLine:     'rgba(255,255,255,0.03)',
    pill:         'rgba(79,142,247,0.12)',
    pillBorder:   'rgba(79,142,247,0.3)',
    pillText:     '#82b4ff',
    shadow:       '0 8px 40px rgba(0,0,0,0.5)',
    shadowCard:   '0 2px 20px rgba(0,0,0,0.4)',
    navLink:      '#c0cbf0',
    isDark:       true,
  },
  light: {
    bg:           '#f4f6fd',
    bgCard:       '#ffffff',
    bgElevated:   '#eaeefc',
    bgGlass:      'rgba(255,255,255,0.95)',
    border:       'rgba(50,70,160,0.12)',
    borderMid:    'rgba(50,70,160,0.24)',
    borderHov:    'rgba(37,99,235,0.5)',
    text:         '#0c1230',
    textSub:      '#3d4f8a',
    textMuted:    '#8a9ac4',
    accent:       '#2563eb',
    accentB:      '#3b82f6',
    accentWarm:   '#d97706',
    accentViolet: '#7c3aed',
    accentGreen:  '#059669',
    accentGlow:   'rgba(37,99,235,0.14)',
    navBg:        'rgba(244,246,253,0.95)',
    gridLine:     'rgba(0,0,0,0.035)',
    pill:         'rgba(37,99,235,0.09)',
    pillBorder:   'rgba(37,99,235,0.25)',
    pillText:     '#1d4ed8',
    shadow:       '0 8px 40px rgba(60,90,200,0.1)',
    shadowCard:   '0 2px 20px rgba(60,90,200,0.07)',
    navLink:      '#1a2660',
    isDark:       false,
  }
}

/* ══════ DATA ══════ */
const AGENTS = [
  { key:'search', icon:'◎', label:'Search Agent',  color:'#f59e0b', desc:'Searches the web for authoritative, recent sources using Tavily AI with smart query formulation.', tool:'web_search' },
  { key:'reader', icon:'◈', label:'Reader Agent',  color:'#4f8ef7', desc:'Picks the highest-quality URL, scrapes full-page content, and extracts structured information.', tool:'scrape_url' },
  { key:'writer', icon:'◆', label:'Writer Agent',  color:'#9b72f7', desc:'Synthesises all research into a structured Markdown report with citations and detailed analysis.', tool:'llm_chain' },
  { key:'critic', icon:'◉', label:'Critic Agent',  color:'#10d98c', desc:'Reviews the report for accuracy, coverage and structure. Scores it out of 10 with actionable points.', tool:'evaluation' },
]

const MODULES = [
  { icon:'⬡', title:'Topic Research', tag:'Multi-Agent', color:'#4f8ef7', desc:'Four specialized AI agents collaborate in real-time to produce a cited, scored research report on any topic.' },
  { icon:'⬡', title:'PDF Chat',       tag:'RAG',         color:'#9b72f7', desc:'Upload any document and ask questions. Answers come with page-level citations from a ChromaDB vector index.' },
  { icon:'⬡', title:'News Intel',     tag:'Live Feed',   color:'#f59e0b', desc:'AI-summarized briefings pulled from the latest sources — Key Developments, Context, and What to Watch.' },
  { icon:'⬡', title:'AI Dashboard',   tag:'Real-time',   color:'#10d98c', desc:'Weather intelligence, travel safety scores, and live headlines — plus a conversational agent using all three tools.' },
]

const STATS = [
  { value:'4',    label:'Specialized Agents', sub:'in the pipeline'   },
  { value:'21',   label:'API Endpoints',       sub:'fully protected'   },
  { value:'500+', label:'PDF Pages',           sub:'supported per doc' },
  { value:'<2s',  label:'First Token',         sub:'Groq LPU speed'    },
]

const FAQS = [
  { q:'What models power ResearchOS?',     a:'ResearchOS runs on Groq\'s ultra-fast LPU hardware using LLaMA 3.3 70B for all agent tasks. The system includes automatic key rotation across multiple API keys so you never hit a rate limit.' },
  { q:'How does PDF chat work?',           a:'Your PDF is split into 1,000-character chunks with 200-character overlap, embedded with HuggingFace\'s all-MiniLM-L6-v2 model, and stored in ChromaDB. Each question retrieves the top-5 semantically similar chunks as context.' },
  { q:'Is my data private?',              a:'All runs are scoped to your authenticated account. PDF sessions are isolated by session UUID and owner-verified on every request. Passwords are hashed with bcrypt — no plaintext credentials ever stored.' },
  { q:'Can I use it without API keys?',   a:'Yes. Without keys, the system switches to simulation mode — a deterministic pipeline showing exactly how the multi-agent flow works, with realistic streaming delays and a sample report.' },
  { q:'How accurate is the research?',    a:'The Critic Agent scores every report out of 10 and flags weaknesses. Reports cite all sources used. Treat ResearchOS as a powerful first-pass research assistant that gives you structured, sourced starting points.' },
  { q:'What file types can I upload?',    a:'Currently text-based PDFs only. Maximum 50MB. Word documents, web URLs, and YouTube transcripts are on the roadmap. The pipeline handles documents up to 500+ pages.' },
]

const TECH_STACK = [
  { label:'LangChain',     sub:'bind_tools loop',  color:'#f59e0b' },
  { label:'Groq LPU',      sub:'~500 tok/s',        color:'#4f8ef7' },
  { label:'LLaMA 3.3 70B', sub:'writer + critic',  color:'#9b72f7' },
  { label:'Tavily',        sub:'web + news search', color:'#f97316' },
  { label:'ChromaDB',      sub:'vector store',      color:'#10d98c' },
  { label:'BeautifulSoup', sub:'html scraper',      color:'#ec4899' },
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
function Reveal({ children, delay = 0, y = 22 }) {
  const [ref, vis] = useInView()
  return (
    <div ref={ref} style={{
      opacity: vis ? 1 : 0,
      transform: vis ? 'translateY(0)' : `translateY(${y}px)`,
      transition: `opacity 0.72s cubic-bezier(0.16,1,0.3,1) ${delay}ms, transform 0.72s cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
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
        fontWeight:800, letterSpacing:'-0.05em', color:t.text,
        margin:'0 0 0.75rem', lineHeight:1.08,
      }}>
        {title}{' '}
        <span
        style={{
        color: accentColor || t.accent,
        textShadow: `0 0 20px ${(accentColor || t.accent)}25`
      }}
    >
      {accent}
    </span>
      </h2>
      {sub && <p style={{ fontSize:15, color:t.textSub, maxWidth:460, margin:'0 auto', lineHeight:1.75 }}>{sub}</p>}
    </div>
  )
}

/* ══════ PIPELINE DEMO ══════ */
function PipelineDemo({ t }) {
  const [step, setStep] = useState(-1)
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(false)

  const run = useCallback(() => {
    if (running) return
    setRunning(true); setDone(false); setStep(0)
    let s = 0
    const advance = () => {
      if (s >= AGENTS.length) { setDone(true); setRunning(false); setStep(-1); return }
      setStep(s); s++; setTimeout(advance, 1250)
    }
    advance()
  }, [running])

  return (
    <div>
      {/* 4-col grid — collapses to 1 col on mobile via CSS class */}
      <div className="pipeline-grid">
        {AGENTS.map((agent, i) => {
          const isActive = running && step === i
          const isDone   = done || (running && step > i)
          return (
            <div key={agent.key} style={{ display:'flex', alignItems:'center' }}>
              <div className="pipeline-card" style={{
                flex:1, padding:'1.4rem',
                background: isActive ? `${agent.color}12` : isDone ? `${agent.color}08` : t.bgCard,
                border: `1.5px solid ${isActive ? agent.color+'70' : isDone ? agent.color+'40' : t.border}`,
                borderRadius:18,
                transition:'all 0.4s cubic-bezier(0.16,1,0.3,1)',
                boxShadow: isActive ? `0 0 40px ${agent.color}30, 0 12px 32px rgba(0,0,0,0.25)` : isDone ? `0 4px 20px ${agent.color}10` : t.shadowCard,
                transform: isActive ? 'translateY(-8px) scale(1.03)' : isDone ? 'translateY(-3px)' : 'none',
                position:'relative', overflow:'hidden',
              }}>
                {/* Top accent bar */}
                <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background: isDone||isActive ? agent.color : 'transparent', borderRadius:'18px 18px 0 0', transition:'background 0.35s' }} />
                {/* Progress bar */}
                {isActive && (
                  <div style={{ position:'absolute', bottom:0, left:0, right:0, height:2, background:t.border }}>
                    <div style={{ height:'100%', background:agent.color, animation:'progressBar 1.25s linear forwards', borderRadius:2 }} />
                  </div>
                )}
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'0.75rem', paddingTop:'0.35rem' }}>
                  <div style={{ width:42, height:42, borderRadius:11, background:`${agent.color}18`, border:`1.5px solid ${agent.color}40`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.15rem', color:agent.color, boxShadow: isActive ? `0 0 18px ${agent.color}50` : 'none', transition:'box-shadow 0.3s', flexShrink:0 }}>{agent.icon}</div>
                  <div style={{ fontSize:9.5, fontFamily:'var(--f-mono)', padding:'3px 10px', borderRadius:99, background: isDone ? '#10d98c14' : isActive ? `${agent.color}18` : t.bgElevated, color: isDone ? '#10d98c' : isActive ? agent.color : t.textMuted, border:`1px solid ${isDone ? '#10d98c35' : isActive ? agent.color+'40' : t.border}`, transition:'all 0.3s' }}>
                    {isDone ? '✓ done' : isActive ? '● live' : '○ queue'}
                  </div>
                </div>
                <div style={{ fontSize:9.5, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.12em', color:agent.color, fontFamily:'var(--f-mono)', marginBottom:3 }}>{agent.key}</div>
                <div style={{ fontFamily:'var(--f-display)', fontWeight:700, fontSize:15, color:t.text, letterSpacing:'-0.03em', marginBottom:'0.5rem' }}>{agent.label}</div>
                <div style={{ fontSize:12.5, color:t.textSub, lineHeight:1.65, marginBottom:'0.85rem' }}>{agent.desc}</div>
                <div style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'3px 9px', background:t.bgElevated, border:`1px solid ${t.border}`, borderRadius:6 }}>
                  <span style={{ fontSize:9, color:t.textMuted, fontFamily:'var(--f-mono)' }}>tool:</span>
                  <span style={{ fontSize:9, color:agent.color, fontFamily:'var(--f-mono)', fontWeight:600 }}>{agent.tool}</span>
                </div>
              </div>
              {/* Arrow connector — hidden on mobile */}
              {i < AGENTS.length - 1 && (
                <div className="pipeline-arrow" style={{ width:32, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, gap:2 }}>
                  <div style={{ flex:1, height:1.5, background: (done||(running&&step>i)) ? `${AGENTS[i].color}70` : t.border, transition:'background 0.4s', borderRadius:99 }} />
                  <div style={{ fontSize:8, color:(done||(running&&step>i)) ? AGENTS[i].color : t.textMuted, transition:'color 0.4s' }}>▶</div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div style={{ textAlign:'center', marginTop:'2.5rem' }}>
        <button onClick={run} disabled={running} className="btn-run" style={{
          padding:'12px 38px', borderRadius:100,
          background: done ? 'rgba(16,217,140,0.12)' : running ? t.bgElevated : t.pill,
          color: done ? '#10d98c' : running ? t.textMuted : t.accent,
          border:`1.5px solid ${done ? '#10d98c50' : running ? t.border : t.pillBorder}`,
          fontFamily:'var(--f-display)', fontWeight:700, fontSize:14, cursor:running?'not-allowed':'pointer',
          letterSpacing:'-0.01em', transition:'all 0.3s',
          boxShadow: (!running && !done) ? `0 0 30px ${t.accentGlow}` : 'none',
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

    const h = (e) => {
      if (e.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', h)
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', h)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  const stack = [
    { icon: '⚡', label: 'FastAPI', sub: 'Backend', color: '#f59e0b' },
    { icon: '🔗', label: 'LangChain', sub: 'Agents', color: '#4f8ef7' },
    { icon: '⚛', label: 'React', sub: 'Frontend', color: '#9b72f7' },
    { icon: '🧠', label: 'Groq', sub: 'LLM', color: '#10d98c' },
  ]

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2000,
        background: 'rgba(0,0,0,0.72)',
        backdropFilter: 'blur(18px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: t.bgCard,
          border: `1px solid ${t.borderMid}`,
          borderRadius: 22,
          maxWidth: 560,
          width: '100%',
          overflow: 'hidden',
          boxShadow: `0 40px 100px rgba(0,0,0,0.55)`,
          animation: 'modalIn 0.32s cubic-bezier(0.34,1.56,0.64,1)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '1.6rem 1.8rem',
            textAlign: 'center',
            background: `linear-gradient(135deg, ${t.accent}15, ${t.accentViolet}15)`,
            borderBottom: `1px solid ${t.border}`,
            position: 'relative',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 3,
              background: `linear-gradient(90deg, ${t.accent}, ${t.accentViolet})`,
            }}
          />

          <div
            style={{
              width: 56,
              height: 56,
              margin: '0 auto 0.9rem',
              borderRadius: 16,
              background: `linear-gradient(135deg, ${t.accent}, ${t.accentViolet})`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.3rem',
              color: '#fff',
              boxShadow: `0 10px 30px ${t.accentGlow}`,
            }}
          >
            ◆
          </div>

          <div
            style={{
              fontFamily: 'var(--f-display)',
              fontSize: '1.35rem',
              fontWeight: 800,
              color: t.text,
              letterSpacing: '-0.04em',
            }}
          >
            Pankaj Thakur
          </div>

          <div
            style={{
              fontSize: 13,
              color: t.textSub,
              marginTop: '0.25rem',
            }}
          >
            Creator of ResearchOS
          </div>

          <div
            style={{
              marginTop: '0.45rem',
              fontSize: 10,
              letterSpacing: '0.12em',
              color: t.textMuted,
              fontFamily: 'var(--f-mono)',
            }}
          >
            MULTI-AGENT AI SYSTEMS
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '1.4rem 1.8rem 1.8rem' }}>
          {/* Compact Tech Stack */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4,1fr)',
              gap: '0.65rem',
              marginBottom: '1rem',
            }}
          >
            {stack.map((item) => (
              <div
                key={item.label}
                style={{
                  background: t.bgElevated,
                  border: `1px solid ${item.color}25`,
                  borderRadius: 12,
                  padding: '0.8rem',
                  textAlign: 'center',
                }}
              >
                <div
                  style={{
                    width: 34,
                    height: 34,
                    margin: '0 auto 0.45rem',
                    borderRadius: 10,
                    background: `${item.color}15`,
                    border: `1px solid ${item.color}35`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.95rem',
                  }}
                >
                  {item.icon}
                </div>

                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: t.text,
                    fontFamily: 'var(--f-display)',
                  }}
                >
                  {item.label}
                </div>

                <div
                  style={{
                    fontSize: 10,
                    color: t.textSub,
                    marginTop: 2,
                    fontFamily: 'var(--f-mono)',
                  }}
                >
                  {item.sub}
                </div>
              </div>
            ))}
          </div>

          {/* Description */}
          <div
            style={{
              background: t.bgElevated,
              border: `1px solid ${t.border}`,
              borderRadius: 12,
              padding: '1rem',
              marginBottom: '1rem',
              fontSize: 13.5,
              color: t.textSub,
              lineHeight: 1.7,
            }}
          >
            ResearchOS is a multi-agent AI research platform featuring
            autonomous workflows, PDF intelligence, live web research, and
            structured report generation powered by modern AI infrastructure.
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', gap: '0.65rem' }}>
            <button
              onClick={onClose}
              style={{
                flex: 1,
                padding: '11px',
                background: t.accent,
                color: '#fff',
                border: 'none',
                borderRadius: 10,
                fontFamily: 'var(--f-display)',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Close
            </button>

            <button
              onClick={() => window.open('https://github.com/pankaj0160', '_blank')}
              style={{
                padding: '11px 18px',
                background: 'transparent',
                color: t.navLink,
                border: `1px solid ${t.border}`,
                borderRadius: 10,
                fontFamily: 'var(--f-display)',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              GitHub ↗
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
    setTimeout(() => { setSubmitting(false); setSubmitted(true) }, 1400)
  }

  const inp = { padding:'11px 14px', background:t.bgElevated, border:`1.5px solid ${t.border}`, borderRadius:10, color:t.text, fontSize:13.5, fontFamily:'var(--f-body)', outline:'none', width:'100%', boxSizing:'border-box', transition:'border-color 0.2s' }

  return (
    <div style={{ minHeight:'100vh', background:t.bg, color:t.text, fontFamily:'var(--f-body)' }}>
      <div style={{ borderBottom:`1px solid ${t.border}`, padding:'0 1.5rem', height:58, display:'flex', alignItems:'center', gap:'1rem', background:t.navBg, backdropFilter:'blur(18px)', position:'sticky', top:0, zIndex:10 }}>
        <button onClick={onBack} style={{ background:'none', border:`1.5px solid ${t.border}`, borderRadius:8, padding:'5px 14px', color:t.navLink, fontSize:13, cursor:'pointer', fontFamily:'var(--f-display)', fontWeight:600, transition:'all 0.2s' }}
          onMouseEnter={e=>{ e.currentTarget.style.borderColor=t.accent; e.currentTarget.style.color=t.accent }}
          onMouseLeave={e=>{ e.currentTarget.style.borderColor=t.border; e.currentTarget.style.color=t.navLink }}>← Back</button>
        <span style={{ fontFamily:'var(--f-display)', fontWeight:800, fontSize:15.5, color:t.text, letterSpacing:'-0.04em' }}>Support Center</span>
      </div>
      <div style={{ maxWidth:860, margin:'0 auto', padding:'4.5rem 1.5rem' }}>
        <div style={{ textAlign:'center', marginBottom:'3.5rem' }}>
          <span style={{ display:'inline-flex', alignItems:'center', gap:7, padding:'5px 16px', borderRadius:99, background:t.pill, border:`1.5px solid ${t.pillBorder}`, fontSize:10.5, fontWeight:700, color:t.pillText, textTransform:'uppercase', letterSpacing:'0.12em', fontFamily:'var(--f-mono)', marginBottom:'1.1rem' }}>💬 Help & Support</span>
          <h1 style={{ fontFamily:'var(--f-display)', fontSize:'clamp(2.4rem,5.5vw,3.4rem)', fontWeight:800, color:t.text, letterSpacing:'-0.055em', margin:'1rem 0 0.75rem' }}>
            How can we <span style={{ color:t.accent }}>help?</span>
          </h1>
          <p style={{ fontSize:15, color:t.textSub, maxWidth:440, margin:'0 auto', lineHeight:1.78 }}>Search the FAQ or submit a ticket. We respond within 24 hours.</p>
        </div>

        <div style={{ position:'relative', maxWidth:520, margin:'0 auto 3rem' }}>
          <span style={{ position:'absolute', left:14, top:'50%', transform:'translateY(-50%)', color:t.textMuted, fontSize:15, pointerEvents:'none' }}>⌕</span>
          <input placeholder="Search FAQs…" value={search} onChange={e=>setSearch(e.target.value)} style={{ ...inp, paddingLeft:42 }}
            onFocus={e=>e.target.style.borderColor=t.accent} onBlur={e=>e.target.style.borderColor=t.border} />
        </div>

        <div style={{ marginBottom:'4rem' }}>
          <h2 style={{ fontFamily:'var(--f-display)', fontSize:'1.1rem', fontWeight:700, color:t.text, marginBottom:'1rem', letterSpacing:'-0.03em' }}>
            Frequently Asked {search && <span style={{ fontSize:12, color:t.textMuted, fontFamily:'var(--f-body)', fontWeight:400 }}>· {filtered.length} result{filtered.length!==1?'s':''}</span>}
          </h2>
          {filtered.map((faq, i) => (
            <div key={i} style={{ border:`1.5px solid ${openFaq===i ? t.borderHov : t.border}`, borderRadius:13, marginBottom:'0.5rem', background:openFaq===i ? t.bgCard : 'transparent', transition:'all 0.22s', overflow:'hidden', boxShadow:openFaq===i ? t.shadowCard : 'none' }}>
              <button onClick={()=>setOpenFaq(openFaq===i?null:i)} style={{ width:'100%', padding:'1rem 1.25rem', background:'none', border:'none', cursor:'pointer', display:'flex', justifyContent:'space-between', alignItems:'center', gap:'1rem', textAlign:'left' }}>
                <span style={{ fontFamily:'var(--f-display)', fontWeight:600, fontSize:14.5, color:t.text, letterSpacing:'-0.02em' }}>{faq.q}</span>
                <span style={{ color:t.accent, fontSize:20, flexShrink:0, transform:openFaq===i?'rotate(45deg)':'none', transition:'transform 0.25s', fontWeight:300 }}>+</span>
              </button>
              {openFaq===i && <div style={{ padding:'0 1.25rem 1.15rem', fontSize:14, color:t.textSub, lineHeight:1.82 }}>{faq.a}</div>}
            </div>
          ))}
        </div>

        <div style={{ background:t.bgCard, border:`1.5px solid ${t.border}`, borderRadius:22, overflow:'hidden', boxShadow:t.shadow }}>
          <div style={{ background:`linear-gradient(135deg,${t.accent}14,${t.accentViolet}14)`, borderBottom:`1.5px solid ${t.border}`, padding:'1.5rem 2rem' }}>
            <h2 style={{ fontFamily:'var(--f-display)', fontSize:'1.25rem', fontWeight:800, color:t.text, letterSpacing:'-0.04em' }}>Submit a Ticket</h2>
            <p style={{ fontSize:13.5, color:t.textSub, marginTop:4 }}>Can't find an answer? We'll get back to you within 24 hours.</p>
          </div>
          <div style={{ padding:'2rem' }}>
            {submitted ? (
              <div style={{ textAlign:'center', padding:'2.5rem 0' }}>
                <div style={{ width:60, height:60, borderRadius:'50%', background:'rgba(16,217,140,0.12)', border:'1.5px solid rgba(16,217,140,0.35)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 1.1rem', fontSize:'1.6rem', color:'#10d98c' }}>✓</div>
                <div style={{ fontFamily:'var(--f-display)', fontWeight:800, fontSize:'1.2rem', color:t.text, marginBottom:'0.4rem', letterSpacing:'-0.04em' }}>Ticket submitted!</div>
                <div style={{ fontSize:14, color:t.textSub }}>We'll respond to <strong style={{color:t.text}}>{form.email}</strong> within 24 hours.</div>
                <button onClick={()=>{ setSubmitted(false); setForm({name:'',email:'',category:'general',message:''}) }} style={{ marginTop:'1.5rem', padding:'10px 24px', background:t.accent, color:'#fff', border:'none', borderRadius:9, fontFamily:'var(--f-display)', fontWeight:700, fontSize:13.5, cursor:'pointer' }}>Submit Another</button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem' }}>
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
                    style={{ ...inp, resize:'vertical', lineHeight:1.65 }}
                    onFocus={e=>e.target.style.borderColor=t.accent} onBlur={e=>e.target.style.borderColor=t.border} />
                </div>
                <button type="submit" disabled={submitting} style={{ padding:'13px', background:submitting?t.bgElevated:t.accent, color:submitting?t.textMuted:'#fff', border:`1.5px solid ${submitting?t.border:t.accent}`, borderRadius:11, fontFamily:'var(--f-display)', fontWeight:800, fontSize:14.5, cursor:submitting?'not-allowed':'pointer', transition:'all 0.2s', letterSpacing:'-0.02em' }}>
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
  const [theme, setTheme]         = useState('dark')
  const [showCreator, setCreator] = useState(false)
  const [showSupport, setSupport] = useState(false)
  const [scrolled, setScrolled]   = useState(false)
  const [openFaq, setOpenFaq]     = useState(null)
  const typed = useTyping(['any topic','any PDF','live news','anything'])
  const t = T[theme]

  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 50)
    window.addEventListener('scroll', h, { passive:true })
    return () => window.removeEventListener('scroll', h)
  }, [])

  if (showSupport) return <SupportPage t={t} onBack={()=>setSupport(false)} />

  const C = { maxWidth:1100, margin:'0 auto', padding:'0 2rem' }

  return (
    <div style={{ minHeight:'100vh', background:t.bg, color:t.text, fontFamily:'var(--f-body)', overflowX:'hidden' }}>

      {/* ── CSS ── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Clash+Display:wght@400;500;600;700&family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,500;12..96,600;12..96,700&family=JetBrains+Mono:wght@400;500;600&display=swap');
        :root {
          --f-display: 'Clash Display', 'Syne', sans-serif;
          --f-body:    'Bricolage Grotesque', 'DM Sans', sans-serif;
          --f-mono:    'JetBrains Mono', monospace;
        }
        *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
        ::selection { background: rgba(79,142,247,0.28); }
        html { scroll-behavior: smooth; }
        body { -webkit-font-smoothing: antialiased; }

        @keyframes fadeUp      { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
        @keyframes fadeIn      { from{opacity:0} to{opacity:1} }
        @keyframes floatOrb    { 0%,100%{transform:translate(-50%,-50%) scale(1)} 50%{transform:translate(-50%,-50%) scale(1.14)} }
        @keyframes spinRing    { to{transform:rotate(360deg)} }
        @keyframes pulse       { 0%,100%{opacity:1} 50%{opacity:0.28} }
        @keyframes scanLine    { 0%{top:-2px;opacity:0} 6%{opacity:0.6} 94%{opacity:0.6} 100%{top:100%;opacity:0} }
        @keyframes modalIn     { from{opacity:0;transform:scale(0.92) translateY(14px)} to{opacity:1;transform:scale(1) translateY(0)} }
        @keyframes progressBar { from{width:0%} to{width:100%} }
        @keyframes blink       { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes statPop     { from{opacity:0;transform:scale(0.82)} to{opacity:1;transform:scale(1)} }
        @keyframes shimmer     { 0%{background-position:-600px 0} 100%{background-position:600px 0} }

        /* Card hover */
        .hov-card {
          transition: transform 0.32s cubic-bezier(0.16,1,0.3,1),
                      box-shadow 0.32s,
                      border-color 0.22s;
        }
        .hov-card:hover { transform: translateY(-7px); }

        /* Button */
        .btn-cta {
          transition: opacity 0.18s, transform 0.18s, box-shadow 0.18s;
          display:inline-flex; align-items:center; text-decoration:none;
        }
        .btn-cta:hover { opacity:0.88; transform:translateY(-2px); }
        .btn-cta:active { transform:translateY(0); }

        /* Nav link hover */
        .nav-link {
          transition: color 0.18s, background 0.18s;
          text-decoration: none;
          font-family: var(--f-body);
          font-size: 13.5px;
          font-weight: 600;
          padding: 6px 12px;
          border-radius: 8px;
          cursor: pointer;
          border: none;
          background: transparent;
          letter-spacing: -0.01em;
        }

        /* Pipeline grid — 4 cols on desktop, 1 on mobile */
        .pipeline-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 0.75rem;
          align-items: start;
        }
        .pipeline-arrow { display:flex; }
        
        /* Agents grid — 4 cols on desktop, 2 on tablet, 1 on mobile */
        .agents-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 0.85rem;
        }

        /* Modules grid — 4 cols desktop, 2 tablet, 1 mobile */
        .modules-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 1rem;
        }

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

        /* Run button hover */
        .btn-run:not(:disabled):hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 30px rgba(79,142,247,0.25) !important;
        }
      `}</style>

      {/* ══════ NAVBAR ══════ */}
      <nav style={{
        position:'fixed', top:0, left:0, right:0, zIndex:300, height:60,
        background: scrolled ? t.navBg : 'transparent',
        backdropFilter: scrolled ? 'blur(24px) saturate(2)' : 'none',
        borderBottom:`1px solid ${scrolled ? t.border : 'transparent'}`,
        transition:'all 0.32s ease',
        display:'flex', alignItems:'center',
      }}>
        <div style={{ ...C, width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between' }}>

          {/* Logo */}
          <div style={{ display:'flex', alignItems:'center', gap:'0.6rem', cursor:'default', flexShrink:0 }}>
            <div style={{ width:34, height:34, borderRadius:9, background:`linear-gradient(135deg,${t.accent},${t.accentViolet})`, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'var(--f-display)', fontWeight:700, fontSize:15, color:'#fff', boxShadow:`0 4px 18px ${t.accentGlow}` }}>R</div>
            <span style={{ fontFamily:'var(--f-display)', fontWeight:700, fontSize:16.5, letterSpacing:'-0.04em', color:t.text }}>ResearchOS</span>
          </div>

          {/* Center links */}
          <div className="nav-center" style={{ display:'flex', alignItems:'center', gap:'0.05rem', background:scrolled ? t.bgElevated : 'transparent', borderRadius:13, padding:scrolled?'4px':'0', border:scrolled?`1px solid ${t.border}`:'none', transition:'all 0.28s' }}>
            {['Features','Pipeline','Agents','FAQ'].map(item => (
              <a key={item} href={`#${item.toLowerCase()}`} className="nav-link"
                style={{ color: t.navLink }}
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

          {/* Right */}
          <div style={{ display:'flex', alignItems:'center', gap:'0.45rem', flexShrink:0 }}>
            <button onClick={()=>setTheme(th=>th==='dark'?'light':'dark')} style={{
              width:36, height:36, borderRadius:9, background:t.bgElevated,
              border:`1.5px solid ${t.border}`, cursor:'pointer', fontSize:15,
              display:'flex', alignItems:'center', justifyContent:'center',
              color:t.text, transition:'all 0.2s',
            }}
              onMouseEnter={e=>{ e.currentTarget.style.borderColor=t.borderMid; e.currentTarget.style.background=t.bgCard }}
              onMouseLeave={e=>{ e.currentTarget.style.borderColor=t.border; e.currentTarget.style.background=t.bgElevated }}>
              {t.isDark ? '○' : '●'}
            </button>

            {user ? (
              <button className="btn-cta" onClick={()=>navigate('/dashboard')} style={{ padding:'7px 18px', background:t.accent, color:'#fff', border:'none', borderRadius:9, fontFamily:'var(--f-display)', fontWeight:700, fontSize:13, cursor:'pointer', letterSpacing:'-0.01em', boxShadow:`0 4px 18px ${t.accentGlow}` }}>
                Dashboard →
              </button>
            ) : (
              <>
                <Link to="/login" className="btn-cta" style={{ padding:'7px 16px', color:t.navLink, border:`1.5px solid ${t.border}`, borderRadius:9, fontFamily:'var(--f-display)', fontWeight:600, fontSize:13, letterSpacing:'-0.01em' }}
                  onMouseEnter={e=>{ e.currentTarget.style.borderColor=t.borderMid; e.currentTarget.style.color=t.text }}
                  onMouseLeave={e=>{ e.currentTarget.style.borderColor=t.border; e.currentTarget.style.color=t.navLink }}>
                  Sign in
                </Link>
                <Link to="/register" className="btn-cta" style={{ padding:'7px 18px', background:t.accent, color:'#fff', borderRadius:9, fontFamily:'var(--f-display)', fontWeight:700, fontSize:13, letterSpacing:'-0.01em', boxShadow:`0 4px 18px ${t.accentGlow}` }}>
                  Get started
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* ══════ HERO ══════ */}
      <section style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', position:'relative', overflow:'hidden', paddingTop:60 }}>
        {/* BG */}
        <div style={{ position:'absolute', inset:0, pointerEvents:'none' }}>
          <div style={{ position:'absolute', inset:0, backgroundImage:`linear-gradient(${t.gridLine} 1px,transparent 1px),linear-gradient(90deg,${t.gridLine} 1px,transparent 1px)`, backgroundSize:'64px 64px', maskImage:'radial-gradient(ellipse 90% 80% at 50% 45%,black 30%,transparent 80%)' }} />
          <div style={{ position:'absolute', top:'38%', left:'50%', width:780, height:580, background:`radial-gradient(ellipse,${t.accentGlow} 0%,transparent 65%)`, filter:'blur(72px)', animation:'floatOrb 12s ease-in-out infinite', transform:'translate(-50%,-50%)' }} />
          <div style={{ position:'absolute', top:'13%', right:'9%', width:260, height:260, border:`1px solid ${t.border}`, borderRadius:'50%', opacity:0.4, animation:'spinRing 48s linear infinite' }} />
          <div style={{ position:'absolute', top:'20%', right:'16%', width:112, height:112, border:`1.5px solid ${t.borderHov}`, borderRadius:'50%', opacity:0.25 }} />
          <div style={{ position:'absolute', bottom:'13%', left:'7%', width:180, height:180, border:`1px solid ${t.border}`, borderRadius:'50%', opacity:0.28, animation:'spinRing 72s linear infinite reverse' }} />
          {t.isDark && <div style={{ position:'absolute', left:0, right:0, height:'1.5px', background:`linear-gradient(90deg,transparent,${t.accent}65,transparent)`, animation:'scanLine 13s linear infinite', top:0 }} />}
        </div>

        <div style={{ ...C, textAlign:'center', position:'relative', zIndex:1, padding:'2rem 2rem' }}>

          <span style={{
            display:'inline-flex', alignItems:'center', gap:8, padding:'5px 16px',
            borderRadius:99, background:t.pill, border:`1.5px solid ${t.pillBorder}`,
            fontSize:10.5, fontWeight:700, color:t.pillText,
            textTransform:'uppercase', letterSpacing:'0.12em', fontFamily:'var(--f-mono)',
            marginBottom:'1.75rem', animation:'fadeUp 0.55s ease both',
          }}>
            <span style={{ width:5, height:5, borderRadius:'50%', background:t.accent, animation:'pulse 2.5s ease-in-out infinite' }} />
            Multi-Agent Research Platform
          </span>

          {/* ── HEADLINE — OS fixed with CSS variable approach ── */}
          <h1 style={{
            fontFamily:'var(--f-display)', fontSize:'clamp(3.2rem,8.5vw,6.4rem)',
            fontWeight:700, lineHeight:1.0, letterSpacing:'-0.055em',
            color:t.text, marginBottom:'1.5rem',
            animation:'fadeUp 0.6s ease 0.08s both',
          }}>
            Research{' '}
            {/* FIX: use separate spans with explicit color/transparent per theme */}
            <span
              style={{
                display: 'inline-block',
                color: t.accent,
                fontWeight: 700,
              }}
            >
              OS
            </span>
            {' '}for
            <br />
            <span style={{ color:t.text }}>
              {typed}
            </span>
            <span style={{ color:t.accent, animation:'blink 1.1s step-end infinite', fontWeight:300 }}>|</span>
          </h1>

          <p style={{ fontSize:'clamp(1rem,2.2vw,1.18rem)', color:t.textSub, maxWidth:540, margin:'0 auto 2.75rem', lineHeight:1.8, animation:'fadeUp 0.6s ease 0.16s both', fontWeight:400 }}>
            Ask any topic, upload a PDF, or track a news story. Specialized AI agents research, write, and critique — returning a structured report in real time.
          </p>

          {/* CTAs */}
          <div className="hero-ctas" style={{ display:'flex', gap:'0.75rem', justifyContent:'center', marginBottom:'3.5rem', animation:'fadeUp 0.6s ease 0.24s both', flexWrap:'wrap' }}>
            {user ? (
              <button className="btn-cta" onClick={()=>navigate('/research')} style={{ padding:'15px 34px', background:t.accent, color:'#fff', border:'none', borderRadius:13, fontFamily:'var(--f-display)', fontWeight:700, fontSize:15.5, cursor:'pointer', boxShadow:`0 0 52px ${t.accentGlow}`, letterSpacing:'-0.02em' }}>
                Open workspace →
              </button>
            ) : (
              <>
                <Link to="/register" className="btn-cta" style={{ padding:'15px 34px', background:t.accent, color:'#fff', borderRadius:13, fontFamily:'var(--f-display)', fontWeight:700, fontSize:15.5, boxShadow:`0 0 52px ${t.accentGlow}`, letterSpacing:'-0.02em' }}>
                  Start for free →
                </Link>
                <Link to="/login" className="btn-cta" style={{ padding:'15px 26px', borderRadius:13, border:`1.5px solid ${t.border}`, color:t.navLink, fontFamily:'var(--f-display)', fontWeight:600, fontSize:14, letterSpacing:'-0.01em' }}
                  onMouseEnter={e=>{ e.currentTarget.style.borderColor=t.borderMid; e.currentTarget.style.color=t.text }}
                  onMouseLeave={e=>{ e.currentTarget.style.borderColor=t.border; e.currentTarget.style.color=t.navLink }}>
                  Sign in
                </Link>
              </>
            )}
            <button className="btn-cta" onClick={()=>setCreator(true)} style={{ padding:'15px 26px', borderRadius:13, border:`1.5px solid ${t.border}`, color:t.navLink, fontFamily:'var(--f-display)', fontWeight:600, fontSize:14, background:'none', cursor:'pointer', letterSpacing:'-0.01em' }}
              onMouseEnter={e=>{ e.currentTarget.style.borderColor=t.borderMid; e.currentTarget.style.color=t.text }}
              onMouseLeave={e=>{ e.currentTarget.style.borderColor=t.border; e.currentTarget.style.color=t.navLink }}>
              About the creator
            </button>
          </div>

          {/* Stats */}
          <div className="stats-row" style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'0.65rem', maxWidth:620, margin:'0 auto', animation:'fadeUp 0.6s ease 0.32s both' }}>
            {STATS.map((s, i) => (
              <div key={s.value} style={{ padding:'14px 16px', background:t.bgCard, border:`1.5px solid ${t.border}`, borderRadius:14, textAlign:'center', boxShadow:t.shadowCard, animation:`statPop 0.5s ease ${0.4+i*0.07}s both` }}>
                <div style={{ fontFamily:'var(--f-display)', fontSize:'1.8rem', fontWeight:700, color:t.accent, letterSpacing:'-0.05em', lineHeight:1 }}>{s.value}</div>
                <div style={{ fontSize:12, fontWeight:600, color:t.text, marginTop:4, letterSpacing:'-0.01em', lineHeight:1.3 }}>{s.label}</div>
                <div style={{ fontSize:9.5, color:t.textMuted, fontFamily:'var(--f-mono)', marginTop:2 }}>{s.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════ PIPELINE ══════ */}
      <section id="pipeline" style={{ padding:'7rem 0', borderTop:`1px solid ${t.border}`, background:t.isDark?'rgba(255,255,255,0.015)':'rgba(0,0,0,0.02)' }}>
        <div style={C}>
          <Reveal>
            <SectionHeader pill="Live Pipeline" title="Watch the agents" accent="collaborate" accentColor={t.accent} sub="Click Run to see all four agents execute in sequence. Each step passes its output to the next." t={t} />
          </Reveal>
          <Reveal delay={100}>
            <PipelineDemo t={t} />
          </Reveal>
        </div>
      </section>

      {/* ══════ FEATURES / MODULES ══════ */}
      <section id="features" style={{ padding:'7rem 0', borderTop:`1px solid ${t.border}` }}>
        <div style={C}>
          <Reveal>
            <SectionHeader pill="Four Modules" title="Everything in" accent="one workspace" accentColor={t.accentWarm} sub="Four intelligence modules sharing a single design system and auth layer." t={t} />
          </Reveal>
          <div className="modules-grid">
            {MODULES.map((m, i) => (
              <Reveal key={m.title} delay={i * 65}>
                <div className="hov-card" style={{ background:t.bgCard, border:`1.5px solid ${t.border}`, borderRadius:20, padding:'1.75rem', height:'100%', cursor:'default', boxShadow:t.shadowCard, position:'relative', overflow:'hidden' }}
                  onMouseEnter={e=>{ e.currentTarget.style.borderColor=`${m.color}60`; e.currentTarget.style.boxShadow=`0 24px 60px ${m.color}16` }}
                  onMouseLeave={e=>{ e.currentTarget.style.borderColor=t.border; e.currentTarget.style.boxShadow=t.shadowCard }}>
                  {/* Color top line */}
                  <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background:`linear-gradient(90deg,${m.color},${m.color}50)`, borderRadius:'20px 20px 0 0' }} />
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.1rem', paddingTop:'0.4rem' }}>
                    <span style={{ fontSize:'1.6rem', color:m.color, filter:`drop-shadow(0 0 12px ${m.color}60)` }}>{m.icon}</span>
                    <span style={{ fontSize:9.5, fontWeight:700, padding:'3px 10px', borderRadius:99, background:`${m.color}15`, color:m.color, border:`1.5px solid ${m.color}40`, fontFamily:'var(--f-mono)', letterSpacing:'0.08em' }}>{m.tag}</span>
                  </div>
                  <div style={{ fontFamily:'var(--f-display)', fontWeight:700, fontSize:17, color:t.text, marginBottom:'0.55rem', letterSpacing:'-0.04em' }}>{m.title}</div>
                  <div style={{ fontSize:13.5, color:t.textSub, lineHeight:1.74 }}>{m.desc}</div>
                  <div style={{ marginTop:'1.5rem', height:2, borderRadius:99, background:`linear-gradient(90deg,${m.color}70,transparent)` }} />
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ══════ AGENTS ══════ */}
      <section id="agents" style={{ padding:'7rem 0', borderTop:`1px solid ${t.border}`, background:t.isDark?'rgba(255,255,255,0.015)':'rgba(0,0,0,0.02)' }}>
        <div style={C}>
          <Reveal>
            <SectionHeader pill="Agent Architecture" title="Meet the" accent="agent team" accentColor={t.accentViolet} sub="Each agent has a specialized role, passing typed results down the chain." t={t} />
          </Reveal>

          <div className="agents-grid">
            {AGENTS.map((agent, i) => (
              <Reveal key={agent.key} delay={i * 65}>
                <div className="hov-card" style={{ background:t.bgCard, border:`1.5px solid ${t.border}`, borderRadius:20, padding:'1.6rem', cursor:'default', height:'100%', boxShadow:t.shadowCard, position:'relative', overflow:'hidden' }}
                  onMouseEnter={e=>{ e.currentTarget.style.borderColor=`${agent.color}65`; e.currentTarget.style.boxShadow=`0 24px 60px ${agent.color}15` }}
                  onMouseLeave={e=>{ e.currentTarget.style.borderColor=t.border; e.currentTarget.style.boxShadow=t.shadowCard }}>
                  <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background:agent.color, borderRadius:'20px 20px 0 0', opacity:0.75 }} />
                  <div style={{ display:'flex', alignItems:'flex-start', gap:'0.85rem', marginBottom:'0.9rem', paddingTop:'0.5rem' }}>
                    <div style={{ width:46, height:46, borderRadius:12, background:`${agent.color}18`, border:`1.5px solid ${agent.color}45`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.2rem', color:agent.color, flexShrink:0 }}>{agent.icon}</div>
                    <div>
                      <div style={{ fontSize:9.5, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.12em', color:agent.color, fontFamily:'var(--f-mono)', marginBottom:4 }}>{agent.key} agent</div>
                      <div style={{ fontFamily:'var(--f-display)', fontWeight:700, fontSize:15.5, color:t.text, letterSpacing:'-0.03em' }}>{agent.label}</div>
                    </div>
                  </div>
                  <p style={{ fontSize:13.5, color:t.textSub, lineHeight:1.72, marginBottom:'1rem' }}>{agent.desc}</p>
                  <div style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'4px 10px', background:t.bgElevated, border:`1.5px solid ${t.border}`, borderRadius:7 }}>
                    <span style={{ fontSize:9.5, color:t.textMuted, fontFamily:'var(--f-mono)' }}>tool:</span>
                    <span style={{ fontSize:9.5, color:agent.color, fontFamily:'var(--f-mono)', fontWeight:600 }}>{agent.tool}</span>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>

          {/* Tech strip */}
          <Reveal delay={220}>
            <div style={{ marginTop:'1.5rem', padding:'1.5rem 2rem', background:t.bgCard, border:`1.5px solid ${t.border}`, borderRadius:18, display:'flex', flexWrap:'wrap', gap:'0.65rem', alignItems:'center', justifyContent:'center', boxShadow:t.shadowCard }}>
              {TECH_STACK.map(item => (
                <div key={item.label} style={{ display:'flex', alignItems:'center', gap:7, padding:'6px 13px', background:t.bgElevated, border:`1.5px solid ${item.color}28`, borderRadius:9, transition:'border-color 0.2s' }}
                  onMouseEnter={e=>e.currentTarget.style.borderColor=`${item.color}55`}
                  onMouseLeave={e=>e.currentTarget.style.borderColor=`${item.color}28`}>
                  <span style={{ width:6, height:6, borderRadius:'50%', background:item.color, flexShrink:0, boxShadow:`0 0 8px ${item.color}90` }} />
                  <span style={{ fontSize:13, fontWeight:600, color:t.text, fontFamily:'var(--f-display)', letterSpacing:'-0.02em' }}>{item.label}</span>
                  <span style={{ fontSize:10, color:t.textMuted, fontFamily:'var(--f-mono)' }}>· {item.sub}</span>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ══════ FAQ ══════ */}
      <section id="faq" style={{ padding:'7rem 0', borderTop:`1px solid ${t.border}` }}>
        <div style={{ ...C, maxWidth:760 }}>
          <Reveal>
            <SectionHeader pill="FAQ" title="Frequently asked" accent="questions" accentColor={t.accentGreen} sub="Everything you need to know about ResearchOS." t={t} />
          </Reveal>
          <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
            {FAQS.map((faq, i) => (
              <Reveal key={i} delay={i * 48}>
                <div style={{ border:`1.5px solid ${openFaq===i ? t.borderHov : t.border}`, borderRadius:14, background:openFaq===i ? t.bgCard : 'transparent', overflow:'hidden', transition:'all 0.22s', boxShadow:openFaq===i ? t.shadowCard : 'none' }}>
                  <button onClick={()=>setOpenFaq(openFaq===i?null:i)} style={{ width:'100%', padding:'1.05rem 1.3rem', background:'none', border:'none', cursor:'pointer', display:'flex', justifyContent:'space-between', alignItems:'center', gap:'1rem', textAlign:'left' }}>
                    <span style={{ fontFamily:'var(--f-display)', fontWeight:600, fontSize:15, color:t.text, letterSpacing:'-0.02em' }}>{faq.q}</span>
                    <span style={{ color:t.accent, fontSize:22, flexShrink:0, transform:openFaq===i?'rotate(45deg)':'none', transition:'transform 0.25s', fontWeight:300, lineHeight:1 }}>+</span>
                  </button>
                  {openFaq===i && <div style={{ padding:'0 1.3rem 1.2rem', fontSize:14.5, color:t.textSub, lineHeight:1.82 }}>{faq.a}</div>}
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ══════ CTA BANNER ══════ */}
      <section style={{ padding:'6.5rem 0', borderTop:`1px solid ${t.border}`, position:'relative', overflow:'hidden' }}>
        <div style={{ position:'absolute', inset:0, pointerEvents:'none', background:`radial-gradient(ellipse 65% 85% at 50% 100%,${t.accentGlow},transparent)` }} />
        {/* Decorative corner */}
        <div style={{ position:'absolute', top:'-60px', right:'-60px', width:300, height:300, border:`1px solid ${t.border}`, borderRadius:'50%', opacity:0.3 }} />
        <div style={{ ...C, textAlign:'center', position:'relative', zIndex:1 }}>
          <Reveal>
            <div style={{ maxWidth:600, margin:'0 auto' }}>
              <h2 style={{ fontFamily:'var(--f-display)', fontSize:'clamp(2.4rem,6vw,4rem)', fontWeight:700, color:t.text, letterSpacing:'-0.055em', marginBottom:'1rem', lineHeight:1.04 }}>
                Open your research
                <br />
                <span style={{ color: t.accent }}>
                  workspace
                </span>{' '}
                <span style={{ color: t.accentViolet }}>
                  today.
                </span>
              </h2>
              <p style={{ fontSize:15, color:t.textSub, marginBottom:'2.5rem', lineHeight:1.8 }}>
                Free to start. No credit card required. All four modules available from day one.
              </p>
              <div className="hero-ctas" style={{ display:'flex', gap:'0.75rem', justifyContent:'center', flexWrap:'wrap' }}>
                {user ? (
                  <button className="btn-cta" onClick={()=>navigate('/dashboard')} style={{ padding:'15px 34px', background:t.accent, color:'#fff', border:'none', borderRadius:13, fontFamily:'var(--f-display)', fontWeight:700, fontSize:15.5, cursor:'pointer', boxShadow:`0 0 52px ${t.accentGlow}`, letterSpacing:'-0.02em' }}>
                    Go to dashboard →
                  </button>
                ) : (
                  <>
                    <Link to="/register" className="btn-cta" style={{ padding:'15px 34px', background:t.accent, color:'#fff', borderRadius:13, fontFamily:'var(--f-display)', fontWeight:700, fontSize:15.5, boxShadow:`0 0 52px ${t.accentGlow}`, letterSpacing:'-0.02em' }}>
                      Create free account →
                    </Link>
                    <button className="btn-cta" onClick={()=>setSupport(true)} style={{ padding:'15px 26px', border:`1.5px solid ${t.border}`, borderRadius:13, color:t.navLink, fontFamily:'var(--f-display)', fontWeight:600, fontSize:14, background:'none', cursor:'pointer', letterSpacing:'-0.01em' }}
                      onMouseEnter={e=>{ e.currentTarget.style.borderColor=t.borderMid; e.currentTarget.style.color=t.text }}
                      onMouseLeave={e=>{ e.currentTarget.style.borderColor=t.border; e.currentTarget.style.color=t.navLink }}>
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
      <footer style={{ borderTop:`1px solid ${t.border}`, padding:'2.5rem 2rem', background:t.isDark?'rgba(0,0,0,0.4)':'rgba(0,0,0,0.025)' }}>
        <div style={{ maxWidth:1100, margin:'0 auto', display:'flex', flexWrap:'wrap', alignItems:'center', justifyContent:'space-between', gap:'1rem' }}>
          <div style={{ display:'flex', alignItems:'center', gap:9 }}>
            <div style={{ width:27, height:27, borderRadius:7, background:`linear-gradient(135deg,${t.accent},${t.accentViolet})`, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'var(--f-display)', fontWeight:700, fontSize:12, color:'#fff' }}>R</div>
            <span style={{ fontFamily:'var(--f-display)', fontWeight:700, fontSize:14.5, color:t.text, letterSpacing:'-0.04em' }}>ResearchOS</span>
            <span style={{ fontSize:12, color:t.textMuted }}>· Multi-Agent Research Platform</span>
          </div>
          <div style={{ display:'flex', gap:'0.1rem', flexWrap:'wrap' }}>
            {[{label:'Features',href:'#features'},{label:'Pipeline',href:'#pipeline'},{label:'FAQ',href:'#faq'},{label:'Support',onClick:()=>setSupport(true)},{label:'Creator',onClick:()=>setCreator(true)}].map(item=>(
              item.href
                ? <a key={item.label} href={item.href} className="nav-link" style={{ color:t.textMuted, fontSize:12.5 }}
                    onMouseEnter={e=>{ e.currentTarget.style.color=t.accent; e.currentTarget.style.background=t.pill }}
                    onMouseLeave={e=>{ e.currentTarget.style.color=t.textMuted; e.currentTarget.style.background='transparent' }}>{item.label}</a>
                : <button key={item.label} className="nav-link" onClick={item.onClick} style={{ color:t.textMuted, fontSize:12.5 }}
                    onMouseEnter={e=>{ e.currentTarget.style.color=t.accent; e.currentTarget.style.background=t.pill }}
                    onMouseLeave={e=>{ e.currentTarget.style.color=t.textMuted; e.currentTarget.style.background='transparent' }}>{item.label}</button>
            ))}
          </div>
          <span style={{ fontSize:10.5, color:t.textMuted, fontFamily:'var(--f-mono)' }}>FastAPI · LangChain · Groq · ChromaDB · React</span>
        </div>
      </footer>

      <CreatorModal open={showCreator} onClose={()=>setCreator(false)} t={t} />
    </div>
  )
}