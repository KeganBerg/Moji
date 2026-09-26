import type { ReactNode } from 'react'
import { CONTACT_EMAIL } from '../lib/site'

export const Mail = () => <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>

export const Cta = ({ children }: { children: ReactNode }) => (
  <p className="info-cta">
    <a href="/">{children}</a>
  </p>
)
