import { useState } from 'react'
import { Link } from 'react-router-dom'
import { authApi } from '../services/authApi'
import Logo from '../components/Logo'

export default function ForgotPasswordPage() {
  const [email,   setEmail]   = useState('')
  const [sent,    setSent]    = useState(false)
  const [error,   setError]   = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await authApi.forgotPassword(email)
      setSent(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-bg">
        <div className="auth-bg-dots" />
        <div className="auth-bg-grid" />
      </div>

      <Link to="/" className="auth-logo">
        <Logo
          size={30}
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

      <div className="auth-card">
        {sent ? (
          <div className="auth-sent">
            <div className="auth-sent-icon">✉</div>
            <h1 className="auth-title">Check your inbox</h1>
            <p className="auth-subtitle">
              If <strong>{email}</strong> is registered, a reset link has been sent.
              Check your spam folder if you don't see it within a minute.
            </p>
            <Link to="/login" className="auth-btn auth-btn--outline" style={{ marginTop: '1.5rem', display: 'inline-block', textAlign: 'center' }}>
              Back to sign in
            </Link>
          </div>
        ) : (
          <>
            <div className="auth-card-header">
              <h1 className="auth-title">Reset password</h1>
              <p className="auth-subtitle">
                Enter your email and we'll send you a reset link.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="auth-form">
              {error && (
                <div className="auth-error">
                  <span className="auth-error-icon">⚠</span>
                  {error}
                </div>
              )}

              <div className="auth-field">
                <label className="auth-label">Email address</label>
                <input
                  type="email"
                  className="auth-input"
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <button
                type="submit"
                className={`auth-btn${loading ? ' auth-btn--loading' : ''}`}
                disabled={loading}
              >
                {loading ? <span className="auth-btn-spinner" /> : 'Send reset link'}
              </button>
            </form>

            <p className="auth-switch">
              <Link to="/login" className="auth-switch-link">← Back to sign in</Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}