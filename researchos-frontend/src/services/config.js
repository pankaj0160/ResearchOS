/**
 * config.js — Single source of truth for all frontend configuration.
 *
 * Why this file exists:
 * Instead of writing import.meta.env.VITE_API_URL in 10 different files,
 * every service file imports API_BASE_URL from here.
 * Changing the backend URL = edit this one file only.
 *
 * import.meta.env.VITE_API_URL reads from your .env file:
 *   - Local dev:  VITE_API_URL=http://localhost:8000
 *   - Production: VITE_API_URL=https://your-render-url.onrender.com
 * If the variable is not set, falls back to "" which means same-origin
 * (useful when frontend and backend are on the same server).
 */

// The base URL of your FastAPI backend.
// All API service files import this instead of reading the env var directly.
export const API_BASE_URL = import.meta.env.VITE_API_URL ?? ''

// App name — used in page titles, error messages, and the README
export const APP_NAME = 'ResearchOS'

// How long to wait for an API response before showing an error (milliseconds).
// 30 seconds is generous — most requests complete in under 2 seconds.
// The research stream has its own 120s timeout in useSSEStream.js.
export const API_TIMEOUT_MS = 30_000

// Maximum file size for PDF uploads (10 MB in bytes).
// Must match the backend's upload limit.
export const MAX_PDF_SIZE_BYTES = 10 * 1024 * 1024