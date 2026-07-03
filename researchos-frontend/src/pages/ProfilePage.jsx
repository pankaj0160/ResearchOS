import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../hooks/useToast'

const NEWS_CATEGORIES = [
  'technology', 'science', 'business', 'health',
  'climate change', 'world news', 'politics', 'sports',
  'artificial intelligence', 'cybersecurity', 'finance',
]

export default function ProfilePage() {
  const { user, updateProfile, logout, logoutAll } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()

  const [city,   setCity]   = useState(user?.city         ?? '')
  const [topic,  setTopic]  = useState(user?.default_topic ?? '')
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)
  const [error,  setError]  = useState('')
  const [loggingOutAll, setLoggingOutAll] = useState(false)

  const handleSave = async (e) => {
    e.preventDefault()
    if (!city.trim()) { setError('City cannot be empty'); return }
    setSaving(true); setError('')
    try {
      await updateProfile({ city: city.trim(), default_topic: topic.trim() })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError(err.message ?? 'Failed to save preferences')
    }
    setSaving(false)
  }

  return (
    <>
      <style>{`
        .profile-page {
          max-width: 560px;
          margin: 2.5rem auto;
          padding: 0 1.25rem 4rem;
          font-family: inherit;
        }

        .profile-eyebrow {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #6366f1;
          margin-bottom: 6px;
        }

        .profile-title {
          font-size: clamp(1.4rem, 4vw, 1.9rem);
          font-weight: 800;
          letter-spacing: -0.03em;
          color: var(--text-primary);
          margin: 0 0 2rem;
        }

        .profile-card {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 1.5rem;
          margin-bottom: 1rem;
        }

        .profile-card-title {
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: #6366f1;
          margin: 0 0 14px;
        }

        .account-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        .account-field-label {
          font-size: 11px;
          color: var(--text-muted);
          margin: 0 0 4px;
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }

        .account-field-value {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary);
          margin: 0;
        }

        .form-group {
          margin-bottom: 18px;
        }

        .form-label {
          display: block;
          font-size: 12px;
          font-weight: 600;
          color: var(--text-muted);
          margin-bottom: 7px;
          text-transform: uppercase;
          letter-spacing: 0.07em;
        }

        .form-input {
          width: 100%;
          padding: 10px 14px;
          font-size: 14px;
          font-family: inherit;
          background: var(--bg-base);
          border: 1.5px solid var(--border);
          border-radius: 10px;
          color: var(--text-primary);
          outline: none;
          transition: border-color 0.15s;
          box-sizing: border-box;
        }

        .form-input:focus {
          border-color: #6366f1;
          background: var(--bg-card);
        }

        .form-hint {
          font-size: 11px;
          color: var(--text-faint);
          margin: 5px 0 0;
        }

        .form-error {
          font-size: 13px;
          color: #ef4444;
          margin: 0 0 14px;
        }

        .btn-save {
          padding: 10px 26px;
          font-size: 14px;
          font-weight: 600;
          font-family: inherit;
          cursor: pointer;
          background: #6366f1;
          border: none;
          border-radius: 10px;
          color: #fff;
          transition: background 0.15s, opacity 0.15s, transform 0.1s;
        }

        .btn-save:hover:not(:disabled) {
          background: #4f51e0;
          transform: translateY(-1px);
        }

        .btn-save:disabled {
          opacity: 0.65;
          cursor: not-allowed;
        }

        .btn-save.saved {
          background: rgba(34, 197, 94, 0.15);
          border: 1px solid rgba(34, 197, 94, 0.4);
          color: #16a34a;
        }

        .session-card {
          background: var(--bg-card);
          border: 1px solid rgba(239, 68, 68, 0.2);
          border-radius: 14px;
          padding: 1.5rem;
        }

        .session-card-title {
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: #ef4444;
          margin: 0 0 8px;
        }

        .session-desc {
          font-size: 13px;
          color: var(--text-muted);
          margin: 0 0 14px;
        }

        .btn-signout {
          padding: 9px 18px;
          font-size: 13px;
          font-weight: 600;
          font-family: inherit;
          cursor: pointer;
          background: rgba(239, 68, 68, 0.08);
          border: 1px solid rgba(239, 68, 68, 0.25);
          border-radius: 8px;
          color: #ef4444;
          transition: background 0.15s;
        }

        .btn-signout:hover {
          background: rgba(239, 68, 68, 0.14);
        }

        /* Dark mode overrides */
        @media (prefers-color-scheme: dark) {
          .form-input {
            background: var(--bg-card-hover);
            border-color: var(--border-strong);
            color: #fafafa;
          }
          .form-input:focus {
            background: var(--bg-card-hover);
          }
        }

        /* Explicit dark class support (for manual toggle) */
        .dark .form-input,
        [data-theme="dark"] .form-input {
          background: var(--bg-card-hover);
          border-color: var(--border-strong);
          color: #fafafa;
        }
        .dark .form-input:focus,
        [data-theme="dark"] .form-input:focus {
          background: var(--bg-card-hover);
        }
        .dark .profile-card,
        [data-theme="dark"] .profile-card,
        .dark .session-card,
        [data-theme="dark"] .session-card {
          background: var(--bg-card);
          border-color: var(--border);
        }
        .dark .profile-title,
        [data-theme="dark"] .profile-title {
          color: #fafafa;
        }
        .dark .account-field-value,
        [data-theme="dark"] .account-field-value {
          color: #fafafa;
        }
        .dark .account-field-label,
        [data-theme="dark"] .account-field-label,
        .dark .form-label,
        [data-theme="dark"] .form-label,
        .dark .session-desc,
        [data-theme="dark"] .session-desc {
          color: #a1a1aa;
        }
        .dark .form-hint,
        [data-theme="dark"] .form-hint {
          color: #52525b;
        }
        .dark .btn-save.saved,
        [data-theme="dark"] .btn-save.saved {
          color: #4ade80;
        }
      `}</style>

      <div className="profile-page">
        <p className="profile-eyebrow">Settings</p>
        <h1 className="profile-title">Profile &amp; Preferences</h1>

        {/* Account info — read only */}
        <div className="profile-card">
          <p className="profile-card-title">Account</p>
          <div className="account-grid">
            <div>
              <p className="account-field-label">Username</p>
              <p className="account-field-value">{user?.username ?? '—'}</p>
            </div>
            <div>
              <p className="account-field-label">Email</p>
              <p className="account-field-value">{user?.email ?? '—'}</p>
            </div>
          </div>
        </div>

        {/* Editable preferences */}
        <div className="profile-card">
          <p className="profile-card-title">Dashboard Preferences</p>

          <form onSubmit={handleSave}>
            <div className="form-group">
              <label className="form-label">Your city (for weather)</label>
              <input
                className="form-input"
                value={city}
                onChange={e => setCity(e.target.value)}
                placeholder="e.g. Mumbai, London, Tokyo"
              />
              <p className="form-hint">Used by the Dashboard weather widget</p>
            </div>

            <div className="form-group">
              <label className="form-label">Default news topic (for headlines)</label>
              <input
                className="form-input"
                list="topic-suggestions"
                value={topic}
                onChange={e => setTopic(e.target.value)}
                placeholder="e.g. technology, climate change, business"
              />
              <datalist id="topic-suggestions">
                {NEWS_CATEGORIES.map(c => <option key={c} value={c} />)}
              </datalist>
              <p className="form-hint">Used by the Dashboard headlines widget. Can be any topic.</p>
            </div>

            {error && <p className="form-error">{error}</p>}

            <button
              type="submit"
              disabled={saving}
              className={`btn-save${saved ? ' saved' : ''}`}
            >
              {saved ? '✓ Saved!' : saving ? 'Saving…' : 'Save preferences'}
            </button>
          </form>
        </div>

        {/* Session / sign out */}
        <div className="session-card">
          <p className="session-card-title">Session</p>
          <p className="session-desc">
            Signing out will clear your session but keep all your data.
          </p>
          <button
            className="btn-signout"
            onClick={() => {
              if (typeof logout === 'function') logout()
              else window.location.href = '/login'
            }}
          >
            Sign out
          </button>

          <div style={{ marginTop: '1.1rem', paddingTop: '1.1rem', borderTop: '1px solid var(--border)' }}>
            <p className="session-desc" style={{ marginBottom: 8 }}>
              Signed in somewhere you don't recognize, or lost a device? Sign out everywhere at once.
            </p>
            <button
              className="btn-signout"
              disabled={loggingOutAll}
              style={{ borderColor: 'rgba(239,68,68,0.35)', color: '#ef4444', opacity: loggingOutAll ? 0.6 : 1 }}
              onClick={async () => {
                if (typeof logoutAll !== 'function') return
                setLoggingOutAll(true)
                try {
                  const result = await logoutAll()
                  if (result?.ok) {
                    toast.success(`Signed out of ${result.data?.sessions_revoked ?? 'all'} session(s)`)
                  }
                } finally {
                  setLoggingOutAll(false)
                  navigate('/login', { replace: true })
                }
              }}
            >
              {loggingOutAll ? 'Signing out everywhere…' : 'Log out of all devices'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}