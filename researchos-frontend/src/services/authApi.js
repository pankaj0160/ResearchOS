/**
 * authApi.js
 *
 * LOCATION: src/services/authApi.js
 *
 * Handles: register, login, forgot-password, reset-password, get profile, update profile.
 */

import { apiClient } from './apiClient.js'

export const authApi = {

  /** Register a new account */
  register: (email, username, password) =>
    apiClient.post('/api/auth/register', {
      body: { email, username, password },
      skipAuth: true,   // public route — no token needed
    }),

  /** Login — returns { token, user } on success */
  login: (email, password) =>
    apiClient.post('/api/auth/login', {
      body: { email, password },
      skipAuth: true,   // public route — no token needed
    }),

  /** Send a password reset email */
  forgotPassword: (email) =>
    apiClient.post('/api/auth/forgot-password', {
      body: { email },
      skipAuth: true,
    }),

  /** Reset password using the token from the email link */
  resetPassword: (token, newPassword) =>
    apiClient.post('/api/auth/reset-password', {
      body: { token, new_password: newPassword },
      skipAuth: true,
    }),

  /** Get the current user's profile — called on every page load */
  getMe: () =>
    apiClient.get('/api/auth/me'),

  /** Update profile fields (city, default_topic) */
  updateMe: (updates) =>
    apiClient.patch('/api/auth/me', { body: updates }),
}

export default authApi