import { TOOLS } from '../lib/tools';
import Link from 'next/link';
import EmailCapture from '../components/EmailCapture';

export default function Home() {
  return (
    <>
      <div className="hero">
        <h1>Every PDF job. Free. And your files never leave your computer.</h1>
        <p>
          {TOOLS.length} crafted tools — merge, split, compress, organize, sign, crop, protect, repair, redact, OCR.
          Unlike upload-based PDF sites, AbetPDF runs the whole job inside this browser tab:
          no waiting uploads, no server holding your contracts, no size limits.
        </p>
        <div className="hero-btns">
          <a className="btn" href="#tools">Pick a tool ↓</a>
          <Link className="btn btn-ghost" href="/compress">Compress a PDF</Link>
        </div>
        <div className="trust-strip" style={{ justifyContent: 'center', marginTop: 18 }}>
          <span>✓ Zero uploads — files stay on device</span>
          <span>✓ Unlimited & free</span>
          <span>✓ No account, no watermark</span>
          <span>✓ Works offline once loaded</span>
        </div>
      </div>
      <h2 className="section-label" id="tools">
        The tools <span className="pill pill-free">all free, all local</span>
      </h2>
      <div className="tool-grid">
        {TOOLS.map((t) => (
          <a key={t.slug} className="tool-card" href={`/${t.slug}`}>
            <div className="tc-name">{t.emoji} {t.name}<span className="tc-tier free">FREE</span></div>
            <div className="tc-desc">{t.tagline}</div>
            <div className="tc-cta">Open tool →</div>
          </a>
        ))}
      </div>
      <div className="card" style={{ maxWidth: 760, margin: '20px auto' }}>
        <h2 className="section-h">Why “no upload” actually matters</h2>
        <p style={{ color: 'var(--ink-2)', fontSize: 14, lineHeight: 1.65 }}>
          Most free PDF sites quietly ship your files to their servers, keep them briefly (or longer),
          and meter how much you may do. If the document is a contract, payslip, ID scan or client
          deck, that is the whole problem. AbetPDF re-implemented those jobs as pure browser code —
          you get the same results with the privacy of doing it on your own machine, and it is faster
          because nothing travels over the network. Part of the Abetworks family — see{' '}
          <a href="https://hub.abetworks.in/">hub.abetworks.in</a> for 35 business tools.
        </p>
      </div>
      <div className="card" style={{ maxWidth: 760, margin: '0 auto 30px' }}>
        <EmailCapture
          tool="abetpdf-premium-waitlist"
          headline="AbetPDF Pro — early access"
          sub={`Batch jobs, Word/Excel conversion, certified digital signatures and an API — across all ${TOOLS.length} tools. Join the waitlist for a founder lifetime discount.`}
        />
      </div>
    </>
  );
}
