/**
 * main.jsx
 *
 * LOCATION: src/main.jsx
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT CHANGED FROM YOUR CURRENT VERSION:
 *
 * ONE addition only — imported ErrorBoundary and wrapped each protected page.
 * Every page now has its own ErrorBoundary so if one page crashes, the others
 * still work. The sidebar and navigation are unaffected by a page-level crash.
 *
 * Everything else is identical to your existing main.jsx.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import './index.css'
import './mobile-responsive.css'

// ── Contexts ──────────────────────────────────────────────────────────────────
import { AuthProvider, useAuth }   from './context/AuthContext'
import { ThemeProvider }           from './context/ThemeProvider'
import { WorkspaceProvider }       from './context/WorkspaceContext'

// ── Layout ────────────────────────────────────────────────────────────────────
import AppShell from './components/Layout/AppShell'

// ── NEW: Error boundary — wraps each page individually ───────────────────────
// If any page crashes during rendering, ErrorBoundary catches it and shows
// a friendly "Something went wrong" card instead of a blank white screen.
// pageName prop is used in the error message: "The Research page ran into..."
import ErrorBoundary from './components/ErrorBoundary'

// ── Public pages ──────────────────────────────────────────────────────────────
import LandingPage        from './pages/Landing'
import LoginPage          from './pages/LoginPage'
import RegisterPage       from './pages/RegisterPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'

// ── Protected pages ───────────────────────────────────────────────────────────
import AIDashboardPage from './pages/AIDashboardPage'
import ResearchPage    from './pages/ResearchPage'
import PDFChatPage     from './pages/PDFChatPage'
import NewsPage        from './pages/NewsPage'
import WorkspacePage   from './pages/WorkspacePage'
import HistoryPage     from './pages/HistoryPage'
import CalendarPage    from './pages/CalendarPage'
import ProfilePage     from './pages/ProfilePage'


// ── Loading screen ────────────────────────────────────────────────────────────
// Shown while AuthContext is checking if the user is still logged in.
// Without this, the app would flash the login page on every refresh.

function LoadingScreen() {
  return (
    <div className="loading-screen">
      <div className="loading-spinner" />
    </div>
  )
}


// ── Route guards ──────────────────────────────────────────────────────────────

/**
 * GuestRoute — redirects logged-in users away from auth pages.
 * If you are already logged in and visit /login, you go to /dashboard.
 */
function GuestRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (user)    return <Navigate to="/dashboard" replace />
  return children
}

/**
 * ProtectedRoute — requires authentication.
 * If you are not logged in and visit /research, you go to /login.
 */
function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (!user)   return <Navigate to="/login" replace />
  return children
}


// ── App tree ──────────────────────────────────────────────────────────────────

function App() {
  return (
    <Routes>

      {/* ── Public routes — no auth required ── */}
      <Route path="/" element={<LandingPage />} />

      <Route path="/login" element={
        <GuestRoute><LoginPage /></GuestRoute>
      } />

      <Route path="/register" element={
        <GuestRoute><RegisterPage /></GuestRoute>
      } />

      <Route path="/forgot-password" element={
        <GuestRoute><ForgotPasswordPage /></GuestRoute>
      } />


      {/* ── Protected routes — auth required, inside AppShell sidebar ── */}
      {/*
        AppShell renders the sidebar + topbar.
        Each page renders inside AppShell's <Outlet />.
        ErrorBoundary wraps EACH PAGE individually — not AppShell itself.

        WHY NOT WRAP APPSHELL?
        If we wrapped AppShell, a crash in ResearchPage would make the
        ENTIRE layout (sidebar + all pages) show the error fallback.
        Wrapping each page means only the crashed page shows the fallback.
        The sidebar and other pages continue to work normally.
      */}
      <Route element={
        <ProtectedRoute><AppShell /></ProtectedRoute>
      }>

        {/* Dashboard — the home screen after login */}
        <Route path="/dashboard" element={
          <ErrorBoundary pageName="Dashboard">
            <AIDashboardPage />
          </ErrorBoundary>
        } />

        {/* Research pipeline — most complex page, most likely to have edge cases */}
        <Route path="/research" element={
          <ErrorBoundary pageName="Research">
            <ResearchPage />
          </ErrorBoundary>
        } />

        {/* PDF Chat — file uploads + streaming, multiple failure points */}
        <Route path="/pdf-chat" element={
          <ErrorBoundary pageName="PDF Chat">
            <PDFChatPage />
          </ErrorBoundary>
        } />

        {/* News — external API data, can return unexpected shapes */}
        <Route path="/news" element={
          <ErrorBoundary pageName="News">
            <NewsPage />
          </ErrorBoundary>
        } />

        {/* Workspace — shows runs grouped by topic */}
        <Route path="/workspace/:id" element={
          <ErrorBoundary pageName="Workspace">
            <WorkspacePage />
          </ErrorBoundary>
        } />

        {/* History — lists all past research runs */}
        <Route path="/history" element={
          <ErrorBoundary pageName="History">
            <HistoryPage />
          </ErrorBoundary>
        } />

        {/* Calendar — research runs plotted by date */}
        <Route path="/calendar" element={
          <ErrorBoundary pageName="Calendar">
            <CalendarPage />
          </ErrorBoundary>
        } />

        {/* Profile — user settings */}
        <Route path="/profile" element={
          <ErrorBoundary pageName="Profile">
            <ProfilePage />
          </ErrorBoundary>
        } />

      </Route>


      {/* ── Fallback — any unknown URL goes to landing page ── */}
      <Route path="*" element={<Navigate to="/" replace />} />

    </Routes>
  )
}


// ── Mount the React app ────────────────────────────────────────────────────────
/*
  Provider order matters — inner providers can access outer ones.
  Current order (outer to inner):
    ThemeProvider     → dark/light mode, no dependencies
    AuthProvider      → login state, no dependencies
    WorkspaceProvider → needs AuthProvider (fetches workspaces after login)
    BrowserRouter     → URL routing, needs to be inside providers
*/
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <WorkspaceProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </WorkspaceProvider>
      </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>
)