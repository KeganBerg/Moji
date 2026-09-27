import { renderToStaticMarkup } from 'react-dom/server'
import { InfoPage } from './pages/InfoPage'
import { getPage, NOT_FOUND, PAGES } from './pages/pages'

export const pages = Object.keys(PAGES)
export { NOT_FOUND }

export function render(key: string) {
  const { description } = getPage(key)
  return { description, html: renderToStaticMarkup(<InfoPage page={key} />) }
}
