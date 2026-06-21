import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import './index.css'
import './mobile-responsive.css' 




import { AuthProvider, useAuth }   from './context/AuthContext'
import { ThemeProvider }           from './context/ThemeProvider'
import { WorkspaceProvider }       from './context/WorkspaceContext'


// Layout
import AppShell                    from './components/Layout/AppShell'

// Public pages
import LandingPage                 from './pages/Landing'
import LoginPage                   from './pages/LoginPage'
import RegisterPage                from './pages/RegisterPage'
import ForgotPasswordPage          from './pages/ForgotPasswordPage'
import WorkspacePage               from './pages/WorkspacePage'
import HistoryPage                 from './pages/HistoryPage'
import CalendarPage                from './pages/CalendarPage'
import ProfilePage                 from './pages/ProfilePage'

// Protected pages
import AIDashboardPage             from './pages/AIDashboardPage'
import ResearchPage                from './pages/ResearchPage'
import PDFChatPage                 from './pages/PDFChatPage'
import NewsPage                    from './pages/NewsPage'



// ── Route guards ─────────────────────────────────────────────────────────────

function LoadingScreen() {
  return (
    <div className="loading-screen">
      <div className="loading-spinner" />
    </div>
  )
}

/** Redirect logged-in users away from auth pages */
function GuestRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (user)    return <Navigate to="/dashboard" replace />
  return children
}

/** Require authentication — redirect to /login if not authed */
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
      {/* ── Public ── */}
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

      {/* ── Protected (inside AppShell sidebar layout) ── */}
      <Route element={
        <ProtectedRoute><AppShell /></ProtectedRoute>
      }>
        <Route path="/dashboard" element={<AIDashboardPage />} />
        <Route path="/research"  element={<ResearchPage />}    />
        <Route path="/pdf-chat"  element={<PDFChatPage />}     />
        <Route path="/news"      element={<NewsPage />}        />
        <Route path="/workspace/:id" element={<WorkspacePage />} />
        <Route path="/profile"       element={<ProfilePage />}   />
        <Route path="/history"  element={<HistoryPage />}  />
        <Route path="/calendar" element={<CalendarPage />} />
       
      </Route>

      {/* ── Fallback ── */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <WorkspaceProvider>   {/* must be inside AuthProvider */}
        <BrowserRouter>
          <App />
        </BrowserRouter>
        </WorkspaceProvider>   {/* must be inside AuthProvider */}
      </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>
)
