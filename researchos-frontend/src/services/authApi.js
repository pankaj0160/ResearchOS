const BASE = import.meta.env.VITE_API_URL ?? ''

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
    ...options,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = data?.detail ?? `Request failed (${res.status})`
    throw new Error(Array.isArray(msg) ? msg.map(e => e.msg).join(', ') : msg)
  }
  return data
}


export const authApi = {
  register: (email, username, password) =>
    request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, username, password }),
    }),

  login: (email, password) =>
    request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  forgotPassword: (email) =>
    request('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  resetPassword: (token, new_password) =>
    request('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, new_password }),
    }),

  me: (token) =>
    request('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    }),

  /**
   * GET /api/auth/me with city + default_topic
   */
  getProfile: (token) =>
    request('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    }),

  /**
   * PATCH /api/auth/me
   */
  updateProfile: (token, updates) =>
    request('/api/auth/me', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(updates),
    }),
}
