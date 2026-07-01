/**
 * ErrorBoundary.jsx
 * Location: src/components/ErrorBoundary.jsx
 *
 * What is an Error Boundary?
 *   A class component that catches JavaScript errors in its child components.
 *   Without it: one buggy component crashes the ENTIRE app (white screen).
 *   With it: only that component shows an error card — everything else works.
 *
 * How it works:
 *   React calls getDerivedStateFromError() when a child throws.
 *   We set hasError: true → render the error UI instead of the broken component.
 *   componentDidCatch() logs the full error for debugging.
 *
 * Usage (already in main.jsx):
 *   <ErrorBoundary pageName="Research">
 *     <ResearchPage />
 *   </ErrorBoundary>
 */

import React from 'react'
import ErrorPage from '../pages/ErrorPage'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = {
      hasError:  false,
      error:     null,
      errorInfo: null,
    }
    this.handleReset = this.handleReset.bind(this)
  }

  static getDerivedStateFromError(error) {
    // Called when any child component throws.
    // Returns new state — triggers a re-render showing the error UI.
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    // Called after getDerivedStateFromError — good place to log to Sentry.
    // For now we log to the browser console so you can see the full stack.
    console.error(
      `[ErrorBoundary] ${this.props.pageName || 'Page'} crashed:`,
      error,
      errorInfo,
    )
    this.setState({ errorInfo })
  }

  handleReset() {
    // Clears the error state so the user can retry.
    // The child component re-renders from scratch.
    this.setState({ hasError: false, error: null, errorInfo: null })
  }

  render() {
    if (this.state.hasError) {
      const detail = this.state.error
        ? `${this.state.error.toString()}\n\n${this.state.errorInfo?.componentStack || ''}`
        : undefined

      return (
        <div style={{ padding: '2rem' }}>
          <ErrorPage
            code={500}
            title={`${this.props.pageName || 'This page'} ran into a problem`}
            message="Something in this section crashed unexpectedly. Your other pages are fine — you can go back or try again."
            detail={detail}
            onRetry={this.handleReset}
          />
        </div>
      )
    }

    return this.props.children
  }
}