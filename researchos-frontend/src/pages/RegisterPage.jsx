import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { authApi } from '../services/authApi'

function passwordStrength(pw) {
  if (!pw) return { score: 0, label: '', color: '' }
  let score = 0
  if (pw.length >= 8)  score++
  if (pw.length >= 12) score++
  if (/[A-Z]/.test(pw)) score++
  if (/[0-9]/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  if (score <= 1) return { score, label: 'Weak',   color: '#ef4444' }
  if (score <= 3) return { score, label: 'Fair',   color: '#f59e0b' }
  if (score === 4) return { score, label: 'Good',  color: '#14b8a6' }
  return               { score, label: 'Strong', color: '#22c55e' }
}

export default function RegisterPage() {
  const { login } = useAuth()
  const navigate  = useNavigate()

  const [username, setUsername] = useState('')
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [showPwd,  setShowPwd]  = useState(false)

  const strength = useMemo(() => passwordStrength(password), [password])
  const pwMatch  = confirm && password === confirm

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    setLoading(true)
    try {
      const res  = await authApi.register(email, username, password)
      // authApi.register returns apiClient envelope: { ok, data: { token, user }, status }
      if (!res.ok) {
        setError(res.error || 'Registration failed — please try again')
        return
      }
      login(res.data.token, res.data.user)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-bg">
        <div className="auth-bg-orb auth-bg-orb--1" />
        <div className="auth-bg-orb auth-bg-orb--2" />
        <div className="auth-bg-grid" />
      </div>

      <Link to="/" className="auth-logo">
        <span className="auth-logo-mark">R</span>
        <span className="auth-logo-text">ResearchOS</span>
      </Link>

      <div className="auth-card">
        <div className="auth-card-header">
          <h1 className="auth-title">Create your workspace</h1>
          <p className="auth-subtitle">Start researching in seconds</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {error && (
            <div className="auth-error">
              <span className="auth-error-icon">⚠</span>
              {error}
            </div>
          )}

          <div className="auth-field">
            <label className="auth-label">Username</label>
            <input
              type="text"
              className="auth-input"
              placeholder="your_handle"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
              autoFocus
              minLength={3}
              maxLength={30}
            />
            <span className="auth-field-hint">Letters, numbers, _ and - only</span>
          </div>

          <div className="auth-field">
            <label className="auth-label">Email address</label>
            <input
              type="email"
              className="auth-input"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="auth-field">
            <label className="auth-label">Password</label>
            <div className="auth-input-wrap">
              <input
                type={showPwd ? 'text' : 'password'}
                className="auth-input auth-input--pw"
                placeholder="Min. 8 characters"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={8}
              />
              <button
                type="button"
                className="auth-pw-toggle"
                onClick={() => setShowPwd(v => !v)}
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

            {/* Strength meter */}
            {password && (
              <div className="pw-strength">
                <div className="pw-strength-bars">
                  {[1, 2, 3, 4, 5].map(n => (
                    <div
                      key={n}
                      className="pw-strength-bar"
                      style={{
                        background: n <= strength.score ? strength.color : 'var(--border)',
                        transition: 'background 0.2s',
                      }}
                    />
                  ))}
                </div>
                <span className="pw-strength-label" style={{ color: strength.color }}>
                  {strength.label}
                </span>
              </div>
            )}
          </div>

          <div className="auth-field">
            <label className="auth-label">Confirm password</label>
            <div className="auth-input-wrap">
              <input
                type={showPwd ? 'text' : 'password'}
                className={`auth-input auth-input--pw ${
                  confirm ? (pwMatch ? 'auth-input--valid' : 'auth-input--invalid') : ''
                }`}
                placeholder="Repeat password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required
              />
              {confirm && (
                <span className="auth-match-icon">
                  {pwMatch ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  )}
                </span>
              )}
            </div>
          </div>

          <button
            type="submit"
            className={`auth-btn${loading ? ' auth-btn--loading' : ''}`}
            disabled={loading}
          >
            {loading ? <span className="auth-btn-spinner" /> : 'Create account'}
          </button>
        </form>

        <p className="auth-switch">
          Already have an account?{' '}
          <Link to="/login" className="auth-switch-link">Sign in →</Link>
        </p>
      </div>
    </div>
  )
}