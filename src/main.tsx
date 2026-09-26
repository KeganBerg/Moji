import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import './index.css'
import App from './App.tsx'
import { loadAnalytics, PAGE_TITLES, routeFor } from './lib/site'
import { InfoPage } from './pages/InfoPage'

const route = routeFor(window.location.pathname)
document.title = PAGE_TITLES[route]
loadAnalytics()

createRoot(document.getElementById('root')!).render(
  <StrictMode>{route === 'app' ? <App /> : <InfoPage route={route} />}</StrictMode>,
)
