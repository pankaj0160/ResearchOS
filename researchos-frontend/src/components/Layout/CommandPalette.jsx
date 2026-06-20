import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { searchApi } from '../../services/searchApi'

/* ─────────────────────────────────────────────────────────────────────────────
   CommandPalette — global Cmd+K search overlay
   
   Key improvements over previous version:
   ① All colors via CSS variables → works in both light AND dark mode
   ② Proper ARIA: role="dialog", aria-modal, role="listbox", aria-activedescendant
   ③ Focus trap: Tab/Shift+Tab stays inside the panel
   ④ Reduced-motion: no backdrop blur on prefers-reduced-motion
   ⑤ Type badges use semantic CSS classes, not hardcoded hex
   ⑥ Jump-to shortcuts have proper hover/focus styling
   ⑦ Scoped <style> injected once — no runtime style churn
───────────────────────────────────────────────────────────────────────────── */

/* ── Type metadata — icons + CSS modifier only, no raw hex ── */
const TYPE_META = {
  research:  { icon: '🔬', label: 'Research',  mod: 'research'  },
  pdf:       { icon: '📄', label: 'PDF Chat',  mod: 'pdf'       },
  news:      { icon: '📰', label: 'News',       mod: 'news'      },
  workspace: { icon: '📁', label: 'Workspace',  mod: 'workspace' },
}

const JUMP_LINKS = [
  { label: 'Research',  icon: '🔬', url: '/research'   },
  { label: 'PDF Chat',  icon: '📄', url: '/pdf-chat'   },
  { label: 'News',      icon: '📰', url: '/news'       },
  { label: 'Dashboard', icon: '🏠', url: '/dashboard'  },
]

export function CommandPalette({ open, onClose }) {
  const [query,   setQuery]   = useState('')
  const [results, setResults] = useState({})
  const [loading, setLoading] = useState(false)
  const [active,  setActive]  = useState(0)

  const inputRef    = useRef(null)
  const listRef     = useRef(null)
  const debounceRef = useRef(null)
  const navigate    = useNavigate()

  /* ── Reset & focus on open ── */
  useEffect(() => {
    if (!open) return
    setQuery('')
    setResults({})
    setActive(0)
    // rAF ensures the element is in the DOM before focusing
    const raf = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(raf)
  }, [open])

  /* ── Lock body scroll while open ── */
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  /* ── Debounced search ── */
  const doSearch = useCallback(async (q) => {
    if (q.length < 2) { setResults({}); setLoading(false); return }
    setLoading(true)
    try {
      const data = await searchApi.global(q)
      setResults(data.results ?? {})
      setActive(0)
    } catch (e) {
      console.error('[CommandPalette] search error:', e)
      setResults({})
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(query), 250)
    return () => clearTimeout(debounceRef.current)
  }, [query, doSearch])

  /* ── Flatten results for keyboard nav ── */
  const allItems = Object.entries(results).flatMap(([type, items]) =>
    items.map(item => ({ ...item, type }))
  )

  /* ── Scroll active item into view ── */
  useEffect(() => {
    if (!listRef.current) return
    const el = listRef.current.querySelector(`[data-idx="${active}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [active])

  function handleSelect(item) {
    navigate(item.url)
    onClose()
  }

  /* ── Keyboard handler — includes basic focus trap ── */
  function handleKey(e) {
    if (e.key === 'Escape') {
      onClose()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive(a => Math.min(a + 1, allItems.length - 1))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive(a => Math.max(a - 1, 0))
      return
    }
    if (e.key === 'Enter' && allItems[active]) {
      e.preventDefault()
      handleSelect(allItems[active])
      return
    }
    // Focus trap: keep Tab inside the panel
    if (e.key === 'Tab') {
      e.preventDefault()
      // Only focusable element in this panel is the input; keep focus there
      inputRef.current?.focus()
    }
  }

  /* ── Backdrop click ── */
  function handleBackdropClick(e) {
    if (e.target === e.currentTarget) onClose()
  }

  if (!open) return null

  const showJump    = allItems.length === 0 && query.length < 2
  const showEmpty   = query.length >= 2 && !loading && allItems.length === 0
  const showResults = allItems.length > 0

  return (
    <>
      {/* Scoped styles — injected once, harmless to re-render */}
      <style>{PALETTE_CSS}</style>

      {/* Backdrop */}
      <div
        className="cp-backdrop"
        onClick={handleBackdropClick}
        role="presentation"
        aria-hidden="false"
      >
        {/* Dialog panel */}
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Command palette — search or jump to a section"
          className="cp-panel"
          onKeyDown={handleKey}
        >
          {/* ── Search bar ── */}
          <div className="cp-search-row">
            <span className="cp-search-icon" aria-hidden="true">
              <SearchIcon />
            </span>

            <input
              ref={inputRef}
              id="cp-input"
              role="combobox"
              aria-expanded={showResults}
              aria-controls="cp-listbox"
              aria-autocomplete="list"
              aria-activedescendant={showResults ? `cp-item-${active}` : undefined}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search research, PDFs, news, workspaces…"
              autoComplete="off"
              spellCheck={false}
              className="cp-input"
            />

            {loading && (
              <span className="cp-loading-badge" aria-live="polite" aria-label="Searching">
                <span className="cp-loading-dot" />
                <span className="cp-loading-dot" />
                <span className="cp-loading-dot" />
              </span>
            )}

            <kbd className="cp-esc-hint" aria-label="Press Escape to close">ESC</kbd>
          </div>

          {/* ── Results / States ── */}
          <div
            id="cp-listbox"
            role="listbox"
            ref={listRef}
            className="cp-body"
            aria-label="Search results"
          >

            {/* Jump-to shortcuts (default state) */}
            {showJump && (
              <div className="cp-section">
                <p className="cp-section-label">Jump to</p>
                {JUMP_LINKS.map(link => (
                  <button
                    key={link.url}
                    className="cp-jump-item"
                    onClick={() => { navigate(link.url); onClose() }}
                  >
                    <span className="cp-jump-icon" aria-hidden="true">{link.icon}</span>
                    <span className="cp-jump-label">{link.label}</span>
                    <span className="cp-jump-arrow" aria-hidden="true">
                      <ArrowIcon />
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* Empty state */}
            {showEmpty && (
              <div className="cp-empty" role="status">
                <span className="cp-empty-icon" aria-hidden="true">
                  <EmptyIcon />
                </span>
                <p className="cp-empty-title">No results for <em>"{query}"</em></p>
                <p className="cp-empty-hint">Try different keywords or check spelling</p>
              </div>
            )}

            {/* Result items */}
            {showResults && allItems.map((item, i) => {
              const meta = TYPE_META[item.type] ?? { icon: '📌', label: item.type, mod: 'default' }
              const isActive = i === active
              return (
                <div
                  key={`${item.type}-${item.id}`}
                  id={`cp-item-${i}`}
                  data-idx={i}
                  role="option"
                  aria-selected={isActive}
                  className={`cp-result-item${isActive ? ' cp-result-item--active' : ''}`}
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setActive(i)}
                >
                  <span className="cp-result-type-icon" aria-hidden="true">{meta.icon}</span>

                  <div className="cp-result-body">
                    <span className="cp-result-title">{item.title}</span>
                    <span className="cp-result-meta">
                      <span className={`cp-type-badge cp-type-badge--${meta.mod}`}>
                        {meta.label}
                      </span>
                      <span className="cp-meta-sep" aria-hidden="true">·</span>
                      <span className="cp-result-subtitle">{item.subtitle}</span>
                    </span>
                  </div>

                  {isActive && (
                    <span className="cp-result-enter-hint" aria-hidden="true">
                      <EnterIcon />
                    </span>
                  )}
                </div>
              )
            })}
          </div>

          {/* ── Footer ── */}
          {showResults && (
            <div className="cp-footer" aria-hidden="true">
              <span className="cp-hint"><KbdArrow /> Navigate</span>
              <span className="cp-hint"><KbdEnter /> Open</span>
              <span className="cp-hint"><KbdEsc />   Close</span>
              <span className="cp-result-count">{allItems.length} result{allItems.length !== 1 ? 's' : ''}</span>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   CSS — scoped to .cp-* prefix.
   
   Token strategy:
   • --cp-bg-*          surface colors
   • --cp-text-*        text hierarchy
   • --cp-border-*      border alpha layers
   • --cp-accent-*      interactive highlight
   • --cp-type-*        per-type badge colors (defined per modifier)
   
   Both :root (light) and [data-theme="dark"] (or prefers-color-scheme: dark)
   are covered, so the component works regardless of how the host toggles themes.
───────────────────────────────────────────────────────────────────────────── */
const PALETTE_CSS = `
/* ── Token definitions — light mode ── */
.cp-backdrop {
  --cp-bg-panel:       #ffffff;
  --cp-bg-row-hover:   #f4f4f5;
  --cp-bg-row-active:  #ede9fe;
  --cp-bg-input:       #f9f9fb;
  --cp-bg-badge:       #f4f4f5;
  --cp-bg-kbd:         #f0f0f2;

  --cp-text-primary:   #09090b;
  --cp-text-secondary: #52525b;
  --cp-text-muted:     #a1a1aa;
  --cp-text-active:    #4f46e5;
  --cp-text-hint:      #a1a1aa;

  --cp-border-panel:   rgba(0, 0, 0, 0.10);
  --cp-border-row:     rgba(0, 0, 0, 0.05);
  --cp-border-input:   rgba(0, 0, 0, 0.08);

  --cp-backdrop-bg:    rgba(0, 0, 0, 0.40);
  --cp-shadow-panel:   0 8px 40px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.08);

  /* Type badge colors — light */
  --cp-type-research-bg:   #ede9fe;
  --cp-type-research-text: #4f46e5;
  --cp-type-pdf-bg:        #ccfbf1;
  --cp-type-pdf-text:      #0d9488;
  --cp-type-news-bg:       #fef9c3;
  --cp-type-news-text:     #a16207;
  --cp-type-workspace-bg:  #f3e8ff;
  --cp-type-workspace-text:#7c3aed;
  --cp-type-default-bg:    #f4f4f5;
  --cp-type-default-text:  #52525b;
}

/* ── Dark mode — via prefers-color-scheme ── */
@media (prefers-color-scheme: dark) {
  .cp-backdrop {
    --cp-bg-panel:       #111113;
    --cp-bg-row-hover:   rgba(255,255,255,0.05);
    --cp-bg-row-active:  rgba(99,102,241,0.14);
    --cp-bg-input:       #111113;
    --cp-bg-badge:       rgba(255,255,255,0.07);
    --cp-bg-kbd:         rgba(255,255,255,0.07);

    --cp-text-primary:   #fafafa;
    --cp-text-secondary: #a1a1aa;
    --cp-text-muted:     #52525b;
    --cp-text-active:    #818cf8;
    --cp-text-hint:      #3f3f46;

    --cp-border-panel:   rgba(255,255,255,0.10);
    --cp-border-row:     rgba(255,255,255,0.04);
    --cp-border-input:   rgba(255,255,255,0.06);

    --cp-backdrop-bg:    rgba(0,0,0,0.65);
    --cp-shadow-panel:   0 30px 80px rgba(0,0,0,0.6);

    --cp-type-research-bg:   rgba(99,102,241,0.18);
    --cp-type-research-text: #818cf8;
    --cp-type-pdf-bg:        rgba(45,212,191,0.15);
    --cp-type-pdf-text:      #2dd4bf;
    --cp-type-news-bg:       rgba(251,191,36,0.15);
    --cp-type-news-text:     #fbbf24;
    --cp-type-workspace-bg:  rgba(192,132,252,0.15);
    --cp-type-workspace-text:#c084fc;
    --cp-type-default-bg:    rgba(255,255,255,0.07);
    --cp-type-default-text:  #a1a1aa;
  }
}

/* ── Also support explicit data-theme="dark" on <html> or <body> ── */
[data-theme="dark"] .cp-backdrop,
.dark .cp-backdrop {
    --cp-bg-panel:       #111113;
    --cp-bg-row-hover:   rgba(255,255,255,0.05);
    --cp-bg-row-active:  rgba(99,102,241,0.14);
    --cp-bg-input:       #111113;
    --cp-bg-badge:       rgba(255,255,255,0.07);
    --cp-bg-kbd:         rgba(255,255,255,0.07);

    --cp-text-primary:   #fafafa;
    --cp-text-secondary: #a1a1aa;
    --cp-text-muted:     #52525b;
    --cp-text-active:    #818cf8;
    --cp-text-hint:      #3f3f46;

    --cp-border-panel:   rgba(255,255,255,0.10);
    --cp-border-row:     rgba(255,255,255,0.04);
    --cp-border-input:   rgba(255,255,255,0.06);

    --cp-backdrop-bg:    rgba(0,0,0,0.65);
    --cp-shadow-panel:   0 30px 80px rgba(0,0,0,0.6);

    --cp-type-research-bg:   rgba(99,102,241,0.18);
    --cp-type-research-text: #818cf8;
    --cp-type-pdf-bg:        rgba(45,212,191,0.15);
    --cp-type-pdf-text:      #2dd4bf;
    --cp-type-news-bg:       rgba(251,191,36,0.15);
    --cp-type-news-text:     #fbbf24;
    --cp-type-workspace-bg:  rgba(192,132,252,0.15);
    --cp-type-workspace-text:#c084fc;
    --cp-type-default-bg:    rgba(255,255,255,0.07);
    --cp-type-default-text:  #a1a1aa;
}

/* ── Backdrop ── */
.cp-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: var(--cp-backdrop-bg);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 14vh;
  animation: cp-fade-in 0.15s ease;
}
@media (prefers-reduced-motion: reduce) {
  .cp-backdrop { animation: none; }
  /* No backdrop-filter at all for reduce-motion users */
}
@media (prefers-reduced-motion: no-preference) {
  .cp-backdrop { backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); }
}
@keyframes cp-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}

/* ── Panel ── */
.cp-panel {
  width: min(620px, 92vw);
  background: var(--cp-bg-panel);
  border: 1px solid var(--cp-border-panel);
  border-radius: 16px;
  overflow: hidden;
  box-shadow: var(--cp-shadow-panel);
  animation: cp-slide-in 0.18s cubic-bezier(0.22, 1, 0.36, 1);
  outline: none;
}
@media (prefers-reduced-motion: reduce) {
  .cp-panel { animation: none; }
}
@keyframes cp-slide-in {
  from { opacity: 0; transform: translateY(-10px) scale(0.97); }
  to   { opacity: 1; transform: translateY(0)     scale(1);    }
}

/* ── Search row ── */
.cp-search-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--cp-border-input);
  background: var(--cp-bg-input);
}

.cp-search-icon {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  color: var(--cp-text-muted);
}

.cp-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  font-size: 15px;
  font-family: inherit;
  color: var(--cp-text-primary);
  min-width: 0;
}
.cp-input::placeholder {
  color: var(--cp-text-muted);
}

/* ── Loading dots ── */
.cp-loading-badge {
  display: flex;
  align-items: center;
  gap: 3px;
  flex-shrink: 0;
}
.cp-loading-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--cp-text-active);
  animation: cp-dot-bounce 1s ease-in-out infinite;
}
.cp-loading-dot:nth-child(2) { animation-delay: 0.12s; }
.cp-loading-dot:nth-child(3) { animation-delay: 0.24s; }
@keyframes cp-dot-bounce {
  0%, 80%, 100% { transform: scale(0.7); opacity: 0.5; }
  40%           { transform: scale(1);   opacity: 1;   }
}
@media (prefers-reduced-motion: reduce) {
  .cp-loading-dot { animation: none; opacity: 0.7; }
}

/* ESC hint */
.cp-esc-hint {
  font-size: 11px;
  font-family: inherit;
  padding: 3px 7px;
  background: var(--cp-bg-kbd);
  border-radius: 6px;
  color: var(--cp-text-muted);
  border: 1px solid var(--cp-border-input);
  flex-shrink: 0;
  cursor: default;
  letter-spacing: 0.03em;
}

/* ── Body scroll container ── */
.cp-body {
  max-height: 420px;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: var(--cp-border-row) transparent;
}
.cp-body::-webkit-scrollbar { width: 5px; }
.cp-body::-webkit-scrollbar-thumb {
  background: var(--cp-border-panel);
  border-radius: 10px;
}

/* ── Section label (Jump to) ── */
.cp-section {
  padding: 12px 8px 6px;
}
.cp-section-label {
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--cp-text-muted);
  padding: 0 10px;
  margin: 0 0 6px;
}

/* ── Jump-to item ── */
.cp-jump-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 10px;
  border-radius: 10px;
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--cp-text-secondary);
  font-size: 14px;
  font-family: inherit;
  text-align: left;
  transition: background 0.1s, color 0.1s;
}
.cp-jump-item:hover,
.cp-jump-item:focus-visible {
  background: var(--cp-bg-row-hover);
  color: var(--cp-text-primary);
  outline: none;
}
.cp-jump-item:focus-visible {
  box-shadow: inset 0 0 0 2px var(--cp-text-active);
}
.cp-jump-icon {
  font-size: 16px;
  flex-shrink: 0;
  line-height: 1;
}
.cp-jump-label {
  flex: 1;
  font-weight: 450;
}
.cp-jump-arrow {
  display: flex;
  align-items: center;
  opacity: 0;
  color: var(--cp-text-muted);
  transition: opacity 0.1s;
}
.cp-jump-item:hover .cp-jump-arrow,
.cp-jump-item:focus-visible .cp-jump-arrow {
  opacity: 1;
}

/* ── Empty state ── */
.cp-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2.5rem 1rem;
  gap: 6px;
  text-align: center;
}
.cp-empty-icon {
  display: flex;
  align-items: center;
  margin-bottom: 4px;
  color: var(--cp-text-muted);
  opacity: 0.6;
}
.cp-empty-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--cp-text-secondary);
  margin: 0;
}
.cp-empty-title em {
  font-style: normal;
  color: var(--cp-text-primary);
}
.cp-empty-hint {
  font-size: 12px;
  color: var(--cp-text-muted);
  margin: 0;
}

/* ── Result item ── */
.cp-result-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 18px;
  cursor: pointer;
  border-bottom: 1px solid var(--cp-border-row);
  background: transparent;
  transition: background 0.08s;
}
.cp-result-item:last-child { border-bottom: none; }
.cp-result-item:hover      { background: var(--cp-bg-row-hover); }
.cp-result-item--active    { background: var(--cp-bg-row-active) !important; }

.cp-result-type-icon {
  font-size: 18px;
  flex-shrink: 0;
  line-height: 1;
}

.cp-result-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.cp-result-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--cp-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
}
/* Active row: boost title contrast slightly */
.cp-result-item--active .cp-result-title {
  color: var(--cp-text-primary);
}

.cp-result-meta {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: nowrap;
  overflow: hidden;
}

/* ── Type badge ── */
.cp-type-badge {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.03em;
  padding: 1px 7px;
  border-radius: 20px;
  white-space: nowrap;
  flex-shrink: 0;
}
.cp-type-badge--research  { background: var(--cp-type-research-bg);  color: var(--cp-type-research-text);  }
.cp-type-badge--pdf       { background: var(--cp-type-pdf-bg);       color: var(--cp-type-pdf-text);       }
.cp-type-badge--news      { background: var(--cp-type-news-bg);      color: var(--cp-type-news-text);      }
.cp-type-badge--workspace { background: var(--cp-type-workspace-bg); color: var(--cp-type-workspace-text); }
.cp-type-badge--default   { background: var(--cp-type-default-bg);   color: var(--cp-type-default-text);   }

.cp-meta-sep {
  color: var(--cp-text-muted);
  flex-shrink: 0;
}
.cp-result-subtitle {
  font-size: 12px;
  color: var(--cp-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Active row mutes subtitle slightly */
.cp-result-item--active .cp-result-subtitle {
  color: var(--cp-text-secondary);
}

.cp-result-enter-hint {
  display: flex;
  align-items: center;
  color: var(--cp-text-active);
  flex-shrink: 0;
  margin-left: auto;
}

/* ── Footer ── */
.cp-footer {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 18px;
  border-top: 1px solid var(--cp-border-row);
}
.cp-hint {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: var(--cp-text-hint);
  white-space: nowrap;
}
.cp-hint svg { flex-shrink: 0; }
.cp-result-count {
  margin-left: auto;
  font-size: 11px;
  color: var(--cp-text-muted);
}

/* ── Keyboard hint chips ── */
.cp-kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-family: inherit;
  padding: 2px 5px;
  background: var(--cp-bg-kbd);
  border: 1px solid var(--cp-border-input);
  border-radius: 5px;
  color: var(--cp-text-hint);
  line-height: 1.4;
}

/* ── Mobile ── */
@media (max-width: 480px) {
  .cp-backdrop { padding-top: 8vh; align-items: flex-end; padding: 0; }
  .cp-panel {
    width: 100%;
    border-radius: 20px 20px 0 0;
    max-height: 85dvh;
    animation: cp-slide-up 0.2s cubic-bezier(0.22, 1, 0.36, 1);
  }
  @keyframes cp-slide-up {
    from { transform: translateY(100%); }
    to   { transform: translateY(0);    }
  }
  .cp-body { max-height: calc(85dvh - 120px); }
}
`

/* ─────────────────────────────────────────────────────────────────────────────
   Micro-icons — inline SVG only where Tabler isn't available via context
───────────────────────────────────────────────────────────────────────────── */

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

function ArrowIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  )
}

function EnterIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 10 4 15 9 20" />
      <path d="M20 4v7a4 4 0 0 1-4 4H4" />
    </svg>
  )
}

function EmptyIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
      <line x1="8" y1="11" x2="14" y2="11" />
    </svg>
  )
}

function KbdArrow() {
  return <span className="cp-kbd">↑↓</span>
}
function KbdEnter() {
  return <span className="cp-kbd">↵</span>
}
function KbdEsc() {
  return <span className="cp-kbd">esc</span>
}