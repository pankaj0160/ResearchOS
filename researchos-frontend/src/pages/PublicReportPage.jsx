/**
 * PublicReportPage.jsx
 * Location: src/pages/PublicReportPage.jsx
 *
 * Public, unauthenticated, read-only view of a shared research report.
 * Route: /r/:token — see main.jsx.
 *
 * This is the frontend half of the shareable-links feature: a user can
 * generate a link from ReportViewer, hand it to anyone, and they land here
 * without needing an account. Only fields explicitly whitelisted by the
 * backend's GET /api/public/reports/{token} are ever sent to this page —
 * no user_id, no workspace_id, no critic feedback.
 */
import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { apiClient } from '../services/apiClient'
import Logo from '../components/Logo'

export default function PublicReportPage() {
  const { token } = useParams()
  const [state, setState] = useState({ loading: true, error: null, report: null })

  useEffect(() => {
    let cancelled = false
    apiClient.get(`/api/public/reports/${token}`).then((res) => {
      if (cancelled) return
      if (!res.ok) {
        setState({ loading: false, error: res.status === 404
          ? "This link doesn't exist or has been revoked."
          : 'Something went wrong loading this report.', report: null })
        return
      }
      setState({ loading: false, error: null, report: res.data })
      // Best-effort SPA meta update for link-preview-adjacent niceness.
      // A real OG-image preview needs server-side rendering, which this
      // client-only app doesn't have — worth knowing if this matters for
      // how the link looks when pasted into Slack/Twitter/etc.
      if (res.data?.topic) document.title = `${res.data.topic} — ResearchOS`
    })
    return () => { cancelled = true }
  }, [token])

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', color: 'var(--text-primary)' }}>
      <header style={{
        borderBottom: '1px solid var(--border)', padding: '0 1.5rem', height: 60,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, background: 'var(--bg-surface)', zIndex: 10,
      }}>
        <Link to="/" style={{ display: 'flex', alignItems: 'center' }}>
          <Logo
            size={28}
            wordmarkColor="var(--text-primary)"
            hexColor="var(--text-faint)"
            osTagColor="var(--accent)"
            osTagTextColor="#fff"
            colors={{
              search: 'var(--agent-search)',
              reader: 'var(--agent-reader)',
              writer: 'var(--agent-writer)',
              critic: 'var(--agent-critic)',
            }}
          />
        </Link>
        <Link
          to="/register"
          style={{
            padding: '8px 16px', borderRadius: 8, background: 'var(--accent)',
            color: '#fff', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13.5,
          }}
        >
          Start your own research →
        </Link>
      </header>

      <main style={{ maxWidth: 760, margin: '0 auto', padding: '3rem 1.5rem 5rem' }}>
        {state.loading && <PublicReportSkeleton />}

        {state.error && (
          <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>🔗</div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, marginBottom: 8 }}>
              {state.error}
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 24 }}>
              The person who shared this may have revoked it, or the link is mistyped.
            </p>
            <Link to="/" style={{ color: 'var(--accent)', fontWeight: 600, fontSize: 14 }}>← Back to ResearchOS</Link>
          </div>
        )}

        {state.report && (
          <article>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px',
              borderRadius: 99, background: 'var(--accent-dim)', border: '1px solid var(--accent-border)',
              color: 'var(--accent)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.06em', fontFamily: 'var(--font-mono)', marginBottom: 18,
            }}>
              Shared report — read only
            </div>

            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.6rem, 4vw, 2.3rem)', fontWeight: 700, lineHeight: 1.2, marginBottom: 14 }}>
              {state.report.topic}
            </h1>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 32, fontSize: 12.5, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              {typeof state.report.score === 'number' && (
                <span>Score: <strong style={{ color: 'var(--text-primary)' }}>{(state.report.score * 10).toFixed(1)}/10</strong></span>
              )}
              <span>{state.report.word_count?.toLocaleString() || 0} words</span>
              <span>{state.report.source_count || 0} sources</span>
              {state.report.created_at && (
                <span>{new Date(state.report.created_at * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</span>
              )}
            </div>

            <div className="markdown-body" style={{ fontSize: 15.5, lineHeight: 1.75, color: 'var(--text-primary)' }}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{state.report.report}</ReactMarkdown>
            </div>

            <div style={{
              marginTop: 56, padding: '1.75rem', borderRadius: 14, textAlign: 'center',
              background: 'var(--bg-card)', border: '1px solid var(--border)',
            }}>
              <p style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 17, marginBottom: 6 }}>
                Generated by four AI agents in ResearchOS
              </p>
              <p style={{ color: 'var(--text-muted)', fontSize: 13.5, marginBottom: 18 }}>
                Search, Reader, Writer, and Critic — running live, in under two minutes.
              </p>
              <Link
                to="/register"
                style={{
                  display: 'inline-block', padding: '11px 24px', borderRadius: 9,
                  background: 'var(--accent)', color: '#fff',
                  fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14,
                }}
              >
                Try it free →
              </Link>
            </div>
          </article>
        )}
      </main>
    </div>
  )
}

function PublicReportSkeleton() {
  const bar = (w, h = 14) => (
    <div style={{ width: w, height: h, borderRadius: 6, background: 'var(--bg-inset)', animation: 'pulse-slow 1.6s ease-in-out infinite' }} />
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {bar('40%', 22)}
      {bar('70%', 30)}
      <div style={{ display: 'flex', gap: 12, margin: '8px 0 20px' }}>
        {bar('80px')}{bar('80px')}{bar('120px')}
      </div>
      {bar('100%')}{bar('95%')}{bar('88%')}{bar('92%')}
    </div>
  )
}