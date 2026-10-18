import Link from 'next/link';
import './globals.css';
import { TOOLS } from '../lib/tools';

export const metadata = {
  metadataBase: new URL('https://pdf.abetworks.in'),
  title: { default: 'AbetPDF — free PDF tools that never upload your files', template: '%s · AbetPDF' },
  description: 'Merge, split, compress, convert, rotate, watermark and more — every PDF job runs 100% in your browser. Free, unlimited, private.',
  openGraph: {
    siteName: 'AbetPDF',
    type: 'website',
    title: 'AbetPDF — free PDF tools that never upload your files',
    description: `${TOOLS.length} crafted PDF tools. Files never leave your device. Free and unlimited, by Abetworks.`,
    images: ['/og.png'],
  },
  twitter: { card: 'summary_large_image', images: ['/og.png'] },
};
export const viewport = { themeColor: '#4f46e5' };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <div className="top-accent" aria-hidden="true" />
        <header className="site-header">
          <div className="wrap header-row">
            <Link className="logo" href="/">
              <span className="logo-mark">A</span>
              Abet<em>PDF</em>
            </Link>
            <nav className="site-nav">
              <Link href="/#tools">Tools</Link>
              <Link href="/pricing">Pricing</Link>
              <a href="https://abetworks.in/">Abetworks suite</a>
            </nav>
          </div>
        </header>
        <main className="wrap">{children}</main>
        <footer className="site-footer">
          <div className="wrap">
            <div className="footer-brand">Abet<em>PDF</em></div>
            <p className="footer-line">
              Private-by-design PDF tools from Abetworks — the team behind 35 business tools at{' '}
              <a href="https://hub.abetworks.in/">hub.abetworks.in</a>. Your files never leave this browser tab.
            </p>
            <div className="footer-row">
              <span>© 2026 Abetworks.</span>
              <span className="footer-links">
                <a href="https://abetworks.in/">abetworks.in</a>
                <Link href="/pricing">Pricing</Link>
                <Link href="/privacy">Privacy</Link>
                <Link href="/terms">Terms</Link>
              </span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
