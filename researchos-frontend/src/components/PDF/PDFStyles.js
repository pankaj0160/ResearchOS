/**
 * PDFStyles.js
 * LOCATION: src/components/PDF/PDFStyles.js
 *
 * Extracted from PDFChatPage.jsx — all scoped .pdf-* CSS lives here.
 * Import: import { PDF_STYLES } from '../components/PDF/PDFStyles'
 * Usage:  <style>{PDF_STYLES}</style>
 */

export const PDF_STYLES = `
/* ── Shell: full viewport height, no page scroll ── */
.pdf-shell {
  display: flex;
  height: calc(100dvh - var(--topnav-height, 56px));
  overflow: hidden;
  background: var(--bg-base, var(--color-background-tertiary));
}

/* ── Sidebar ── */
.pdf-sidebar {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  width: 240px;
  border-right: 0.5px solid var(--border, var(--color-border-tertiary));
  background: var(--bg-surface, var(--color-background-secondary));
  transition: width 0.2s ease;
  overflow: hidden;
  position: relative;
  z-index: 10;
}
.pdf-sidebar--collapsed {
  width: 52px;
}
.pdf-sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 10px 10px 14px;
  border-bottom: 0.5px solid var(--border, var(--color-border-tertiary));
  min-height: 48px;
  flex-shrink: 0;
}
.pdf-sidebar-title {
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-muted, var(--color-text-secondary));
  white-space: nowrap;
}
.pdf-sidebar-body {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}

/* ── Icon rail (collapsed state) ── */
.pdf-icon-rail {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 0;
}
.pdf-rail-btn {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  color: var(--text-muted, var(--color-text-secondary));
}
.pdf-rail-btn:hover {
  background: var(--bg-hover, var(--color-background-primary));
  color: var(--text-primary, var(--color-text-primary));
}
.pdf-rail-doc--active {
  background: var(--accent-soft, var(--color-background-info)) !important;
  color: var(--accent, var(--color-text-info)) !important;
}

/* ── Chat column ── */
.pdf-chat-col {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

/* ── Topbar ── */
.pdf-topbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 16px;
  height: 48px;
  border-bottom: 0.5px solid var(--border, var(--color-border-tertiary));
  background: var(--bg-surface, var(--color-background-secondary));
  flex-shrink: 0;
}
.pdf-topbar-doc {
  display: flex;
  align-items: center;
  gap: 7px;
  flex: 1;
  min-width: 0;
}
.pdf-topbar-name {
  font-size: 13.5px;
  font-weight: 500;
  color: var(--text-primary, var(--color-text-primary));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 320px;
}
.pdf-topbar-meta {
  font-size: 11.5px;
  color: var(--text-muted, var(--color-text-secondary));
  white-space: nowrap;
  flex-shrink: 0;
}
.pdf-topbar-placeholder {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary, var(--color-text-primary));
}
.pdf-topbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

/* Streaming badge */
.pdf-streaming-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-muted, var(--color-text-secondary));
  padding: 3px 10px;
  border-radius: 20px;
  border: 0.5px solid var(--border, var(--color-border-tertiary));
  background: var(--bg-surface, var(--color-background-secondary));
}
.pdf-streaming-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--accent, #10b981);
  animation: pdf-pulse 1.2s ease-in-out infinite;
}
@keyframes pdf-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: 0.4; transform: scale(0.7); }
}

/* ── Chat body — fills remaining height ── */
.pdf-chat-body {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* ── Empty state ── */
.pdf-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 2rem;
  text-align: center;
}
.pdf-empty-icon-wrap {
  width: 56px;
  height: 56px;
  border-radius: 16px;
  background: var(--bg-card, var(--color-background-primary));
  border: 0.5px solid var(--border, var(--color-border-tertiary));
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 1rem;
  color: var(--text-muted, var(--color-text-secondary));
}
.pdf-empty-title {
  font-size: 18px;
  font-weight: 500;
  color: var(--text-primary, var(--color-text-primary));
  margin: 0 0 0.5rem;
}
.pdf-empty-desc {
  font-size: 14px;
  color: var(--text-muted, var(--color-text-secondary));
  max-width: 380px;
  line-height: 1.6;
  margin: 0 0 1.5rem;
}
.pdf-empty-features {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  max-width: 440px;
  margin-bottom: 1.75rem;
}
.pdf-empty-feature {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-secondary, var(--color-text-secondary));
  background: var(--bg-card, var(--color-background-primary));
  border: 0.5px solid var(--border, var(--color-border-tertiary));
  border-radius: 10px;
  padding: 10px 12px;
  text-align: left;
}
.pdf-empty-feature-icon {
  flex-shrink: 0;
  color: var(--text-muted, var(--color-text-secondary));
}
.pdf-upload-cta {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 10px 22px;
  background: var(--accent, #10b981);
  color: #fff;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.15s;
}
.pdf-upload-cta:hover { opacity: 0.88; }

/* ── Messages pane ── */
.pdf-messages-wrap {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}
.pdf-messages {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 24px 24px 8px;
  scroll-behavior: smooth;
}
.pdf-messages::-webkit-scrollbar { width: 5px; }
.pdf-messages::-webkit-scrollbar-track { background: transparent; }
.pdf-messages::-webkit-scrollbar-thumb {
  background: var(--border, var(--color-border-tertiary));
  border-radius: 10px;
}

/* ── Welcome screen ── */
.pdf-welcome {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 60%;
  padding: 2rem 1rem;
  text-align: center;
}
.pdf-welcome-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 500;
  color: var(--accent, #10b981);
  background: color-mix(in srgb, var(--accent, #10b981) 12%, transparent);
  border: 0.5px solid color-mix(in srgb, var(--accent, #10b981) 30%, transparent);
  border-radius: 20px;
  padding: 4px 12px;
  margin-bottom: 1rem;
}
.pdf-welcome-title {
  font-size: 20px;
  font-weight: 500;
  color: var(--text-primary, var(--color-text-primary));
  margin: 0 0 0.35rem;
  max-width: 500px;
}
.pdf-welcome-title em {
  font-style: normal;
  color: var(--accent, #10b981);
}
.pdf-welcome-meta {
  font-size: 13px;
  color: var(--text-muted, var(--color-text-secondary));
  margin: 0 0 1.75rem;
}

/* ── Suggested prompts ── */
.pdf-suggestions {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  width: 100%;
  max-width: 560px;
}
.pdf-suggestion {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  background: var(--bg-card, var(--color-background-primary));
  border: 0.5px solid var(--border, var(--color-border-tertiary));
  border-radius: 12px;
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s, background 0.15s;
}
.pdf-suggestion:hover {
  border-color: var(--accent, #10b981);
  background: color-mix(in srgb, var(--accent, #10b981) 5%, var(--bg-card, var(--color-background-primary)));
}
.pdf-suggestion-icon {
  font-size: 16px;
  flex-shrink: 0;
  line-height: 1.4;
}
.pdf-suggestion-label {
  font-size: 13px;
  color: var(--text-primary, var(--color-text-primary));
  line-height: 1.45;
}

/* ── Typing indicator ── */
.pdf-typing {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 14px 16px;
  width: fit-content;
  background: var(--bg-card, var(--color-background-primary));
  border: 0.5px solid var(--border, var(--color-border-tertiary));
  border-radius: 14px;
  margin: 4px 0 8px;
}
.pdf-typing span {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--text-muted, var(--color-text-secondary));
  animation: pdf-bounce 1.2s ease-in-out infinite;
}
.pdf-typing span:nth-child(2) { animation-delay: 0.15s; }
.pdf-typing span:nth-child(3) { animation-delay: 0.30s; }
@keyframes pdf-bounce {
  0%, 80%, 100% { transform: translateY(0); opacity: 0.5; }
  40%           { transform: translateY(-6px); opacity: 1; }
}

/* ── Error message ── */
.pdf-error-msg {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--color-text-danger, #e53e3e);
  background: var(--color-background-danger, #fff5f5);
  border: 0.5px solid var(--color-border-danger, #fed7d7);
  border-radius: 10px;
  padding: 10px 14px;
  margin: 4px 0;
}

/* ── Input area ── */
.pdf-input-wrap {
  flex-shrink: 0;
  padding: 8px 24px 16px;
  border-top: 0.5px solid var(--border, var(--color-border-tertiary));
  background: var(--bg-surface, var(--color-background-secondary));
}
.pdf-quick-chips {
  display: flex;
  gap: 7px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}
.pdf-chip {
  font-size: 12px;
  padding: 4px 12px;
  border-radius: 20px;
  border: 0.5px solid var(--border, var(--color-border-tertiary));
  background: var(--bg-card, var(--color-background-primary));
  color: var(--text-secondary, var(--color-text-secondary));
  cursor: pointer;
  transition: border-color 0.12s, color 0.12s;
  white-space: nowrap;
}
.pdf-chip:hover {
  border-color: var(--accent, #10b981);
  color: var(--accent, #10b981);
}

/* ── Shared icon button ── */
.pdf-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: 8px;
  padding: 6px;
  color: var(--text-muted, var(--color-text-secondary));
  transition: background 0.12s, color 0.12s;
}
.pdf-icon-btn:hover {
  background: var(--bg-hover, var(--color-background-primary));
  color: var(--text-primary, var(--color-text-primary));
}
.pdf-collapse-btn { flex-shrink: 0; }
.pdf-mobile-menu-btn { display: none; }
.pdf-clear-btn {
  font-size: 12.5px;
  padding: 5px 10px;
  border: 0.5px solid var(--border, var(--color-border-tertiary));
  border-radius: 8px;
}
.pdf-clear-label { color: var(--text-muted, var(--color-text-secondary)); }

/* ── Mobile overlay ── */
.pdf-mobile-overlay {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.45);
  z-index: 9;
}

/* ── Mobile breakpoint ── */
@media (max-width: 768px) {
  .pdf-shell {
    height: calc(100dvh - var(--topnav-height, 56px));
  }
  .pdf-mobile-menu-btn { display: flex; }
  .pdf-mobile-overlay  { display: block; }

  .pdf-sidebar {
    position: fixed;
    left: 0;
    top: var(--topnav-height, 56px);
    height: calc(100dvh - var(--topnav-height, 56px));
    width: 280px !important;
    transform: translateX(-100%);
    transition: transform 0.22s ease;
    z-index: 10;
    box-shadow: 4px 0 24px rgba(0,0,0,0.12);
  }
  .pdf-sidebar--mobile-open {
    transform: translateX(0) !important;
  }
  .pdf-collapse-btn { display: none; }

  .pdf-suggestions      { grid-template-columns: 1fr; }
  .pdf-empty-features   { grid-template-columns: 1fr; }
  .pdf-topbar-meta      { display: none; }
  .pdf-messages         { padding: 16px 14px 8px; }
  .pdf-input-wrap       { padding: 8px 14px 14px; }
}
`