import { renderToStaticMarkup } from 'react-dom/server'
import { InfoPage } from './pages/InfoPage'
import { PAGES } from './pages/pages'

export const pages = Object.keys(PAGES)

export function render(key: string) {
  const { description } = PAGES[key]
  return { description, html: renderToStaticMarkup(<InfoPage page={key} />) }
}
