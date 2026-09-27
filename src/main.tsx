import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/schibsted-grotesk'
import '@fontsource-variable/bricolage-grotesque'
import './index.css'
import App from './App.tsx'
import { readStored, setLanguage } from './lib/i18n'
import { loadAnalytics } from './lib/site'
import { InfoPage } from './pages/InfoPage'
import { pageFor } from './pages/pages'

// Info pages are prerendered to static HTML at build time (scripts/prerender.mjs);
// rendering again here replaces that markup with the same content.
const page = pageFor(window.location.pathname)
loadAnalytics()

const render = () =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>{page ? <InfoPage page={page} /> : <App />}</StrictMode>,
  )

// Load a saved editor language before the first paint so the page doesn't
// flash English first. setLanguage never throws; a failed load leaves English.
const stored = page ? 'en' : readStored()
if (stored === 'en') render()
else void setLanguage(stored).then(render)
