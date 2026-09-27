import { SiteFooter, SiteHeader } from '../components/SiteChrome'
import { getPage } from './pages'

export function InfoPage({ page: key }: { page: string }) {
  const page = getPage(key)
  return (
    <div className="shell">
      <SiteHeader />
      <main className="info">
        <a className="info-back" href="/">
          ← Back to the editor
        </a>
        <h1>{page.heading}</h1>
        <p className="info-lede">{page.lede}</p>
        {page.body}
      </main>
      <SiteFooter />
    </div>
  )
}
