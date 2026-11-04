import type { Metadata, Viewport } from 'next'
import { Libre_Baskerville, IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google'
import './globals.css'
import Nav from '@/components/Nav'

const libreBaskerville = Libre_Baskerville({
  subsets: ['latin'],
  weight: ['400', '700'],
  style: ['normal', 'italic'],
  variable: '--font-libre-baskerville',
  display: 'swap',
})

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-ibm-plex-mono',
  display: 'swap',
})

const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-ibm-plex-sans',
  display: 'swap',
})

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

export const metadata: Metadata = {
  metadataBase: new URL('https://proj-dr4ft.vercel.app'),
  title: {
    template: '%s | Draft',
    default: 'Draft | Resume review and builder',
  },
  description: 'Review your resume, build a printable document, and open job-board searches for your next role.',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'Draft | Resume review and builder',
    description: 'Review your resume and make your experience easier to read.',
    type: 'website',
    url: 'https://proj-dr4ft.vercel.app',
    siteName: 'Draft',
  },
  twitter: {
    card: 'summary',
    title: 'Draft | Resume review and builder',
    description: 'Review your resume and make your experience easier to read.',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`${libreBaskerville.variable} ${ibmPlexMono.variable} ${plexSans.variable}`}
    >
      <body>
        <a href="#main" className="skip-link">Skip to content</a>
        <header>
          <Nav />
        </header>
        <main id="main" className="w-full">{children}</main>
        <footer className="site-footer">
          <span>Built by Thomas Ou</span>
          <span aria-hidden>·</span>
          <a href="https://github.com/Smokeybear10/203.PROJ.draft" target="_blank" rel="noopener noreferrer">Source</a>
        </footer>
      </body>
    </html>
  )
}
