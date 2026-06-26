import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { authApi } from '../services/authApi'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate  = useNavigate()

  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [showPwd,  setShowPwd]  = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const result = await authApi.login(email, password)

    if (result.ok) {
      login(result.data.token, result.data.user)
      navigate('/dashboard', { replace: true })
    } else {
      setError(result.error || 'Login failed — please check your credentials')
    }

    setLoading(false)
  }

  return (
    <div className="auth-page">
      {/* Ambient background */}
      <div className="auth-bg">
        <div className="auth-bg-orb auth-bg-orb--1" />
        <div className="auth-bg-orb auth-bg-orb--2" />
        <div className="auth-bg-grid" />
      </div>

      {/* Logo link */}
      <Link to="/" className="auth-logo">
        <span className="auth-logo-mark">R</span>
        <span className="auth-logo-text">ResearchOS</span>
      </Link>

      <div className="auth-card">
        <div className="auth-card-header">
          <h1 className="auth-title">Welcome back</h1>
          <p className="auth-subtitle">Sign in to your workspace</p>
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

          <div className="auth-field">
            <div className="auth-label-row">
              <label className="auth-label">Password</label>
              <Link to="/forgot-password" className="auth-forgot">Forgot password?</Link>
            </div>
            <div className="auth-input-wrap">
              <input
                type={showPwd ? 'text' : 'password'}
                className="auth-input auth-input--pw"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="auth-pw-toggle"
                onClick={() => setShowPwd(v => !v)}
                aria-label={showPwd ? 'Hide password' : 'Show password'}
              >
                {showPwd ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className={`auth-btn${loading ? ' auth-btn--loading' : ''}`}
            disabled={loading}
          >
            {loading ? (
              <span className="auth-btn-spinner" />
            ) : (
              'Sign in'
            )}
          </button>
        </form>

        <p className="auth-switch">
          Don't have an account?{' '}
          <Link to="/register" className="auth-switch-link">Create one →</Link>
        </p>
      </div>

      {/* Demo hint */}
      <p className="auth-demo-hint">
        No account yet?{' '}
        <Link to="/register" className="auth-switch-link">Register in 10 seconds</Link>
      </p>
    </div>
  )
}