import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import './index.css'

// Apply saved theme before first render to avoid FOUC
;(function () {
  const saved = localStorage.getItem('audit-theme')
  if (saved === 'dark') document.documentElement.setAttribute('data-theme', 'dark')
  else if (saved === 'light') document.documentElement.setAttribute('data-theme', 'light')
  // 'system' or missing: let media query handle it
})()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
)
