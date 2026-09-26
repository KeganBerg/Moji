import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import './index.css'
import App from './App.tsx'
import { loadAnalytics } from './lib/site'
import { InfoPage } from './pages/InfoPage'
import { PAGES, pageFor } from './pages/pages'

// Info pages are prerendered to static HTML at build time (scripts/prerender.mjs);
// rendering again here replaces that markup with the same content.
const page = pageFor(window.location.pathname)
if (page) document.title = PAGES[page].title
loadAnalytics()

createRoot(document.getElementById('root')!).render(
  <StrictMode>{page ? <InfoPage page={page} /> : <App />}</StrictMode>,
)
