import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/schibsted-grotesk'
import '@fontsource-variable/bricolage-grotesque'
import './index.css'
import App from './App.tsx'
import { Spooky } from './components/Spooky'
import { loadAnalytics } from './lib/site'
import { InfoPage } from './pages/InfoPage'
import { pageFor } from './pages/pages'

// Info pages are prerendered to static HTML at build time (scripts/prerender.mjs);
// rendering again here replaces that markup with the same content.
const page = pageFor(window.location.pathname)
loadAnalytics()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Spooky />
    {page ? <InfoPage page={page} /> : <App />}
  </StrictMode>,
)
