import Link from 'next/link';
import { PRO } from '../../lib/premium';
import { TOOLS } from '../../lib/tools';
import EmailCapture from '../../components/EmailCapture';

export function generateMetadata() {
  const title = 'Pricing — AbetPDF Pro';
  const description = 'Every AbetPDF tool is free and unlimited. Pro adds print-grade engines: 300 dpi OCR accuracy, 300 dpi flatten, 432 dpi export and batch mode — $6/mo, cancel anytime.';
  return {
    title,
    description,
    alternates: { canonical: { url: '/pricing', absolute: false } },
    openGraph: { title, description, type: 'website', siteName: 'AbetPDF', images: ['/og.png'] },
    twitter: { card: 'summary_large_image', title, description },
  };
}

const rows = [
  ['All ' + TOOLS.length + ' PDF tools, unlimited & private', true, true],
  ['No signup, no watermark, no upload', true, true],
  ['Standard quality engines', true, true],
  ['300 dpi Pro OCR (small text, bad scans)', false, true],
  ['300 dpi print-quality Flatten', false, true],
  ['432 dpi page export for print & design', false, true],
  ['De-noise & binarize bad scans before OCR', false, true],
  ['Word→PDF keeps bold & italics', false, true],
  ['Compare PRO — side-by-side snapshots of changed pages', false, true],
  ['Batch convert — whole folders at once', false, true],
  ['API access & certified e-signatures', false, 'soon'],
];

export default function Pricing() {
  const cell = (v) => (v === true ? <span className="plan-yes">✓</span> : v === 'soon' ? <span className="plan-soon">soon</span> : <span className="plan-no">—</span>);
  const faqs = [
    ['Why paid at all if the free tier is unlimited?', 'Browser processing means your files cost us nothing — free stays genuinely unlimited for normal use. Pro exists for the demanding 5%: print shops, legal OCR on tiny fonts, archival scans. Your money goes to keeping servers zero-cost by design.'],
    ['Do my files become less private when I pay?', 'No. Pro runs the exact same code in your browser — the payment buys engine quality, not servers. We still never see your documents.'],
    ['Cancel anytime?', 'Yes. Stripe handles the billing; cancel in two clicks from the customer portal, keep access to the end of the period.'],
    ['Student or nonprofit?', 'Write to hello@abetworks.in — we waive Pro for classrooms and registered nonprofits.'],
  ];
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        '@context': 'https://schema.org', '@type': 'Product', name: 'AbetPDF Pro',
        description: 'Print-grade PDF engines that run entirely in your browser.',
        brand: { '@type': 'Brand', name: 'AbetPDF' },
        offers: { '@type': 'Offer', price: '6', priceCurrency: 'USD', url: 'https://abetpdf.abetworks.in/pricing', availability: 'https://schema.org/InStock' },
      }) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        '@context': 'https://schema.org', '@type': 'FAQPage',
        mainEntity: faqs.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
      }) }} />
      <div className="hero" style={{ textAlign: 'center' }}>
        <h1>Free stays free. Pro gets you print-ready.</h1>
        <p style={{ maxWidth: 620, margin: '0 auto' }}>
          Every one of AbetPDF’s {TOOLS.length} tools is unlimited and private — that is the product, not a teaser.
          AbetPDF Pro sharpens the engines for professionals: {PRO.monthly}, cancel anytime.
        </p>
      </div>
      <div className="plan-grid">
        <div className="plan-card">
          <h3>Free</h3>
          <p className="plan-price">₹0 / $0</p>
          <p className="plan-sub">All {TOOLS.length} tools. Unlimited. No account.</p>
          <Link className="btn btn-ghost" href="/#tools">Start now →</Link>
        </div>
        <div className="plan-card pro">
          <h3>Pro</h3>
          <p className="plan-price">{PRO.monthly}</p>
          <p className="plan-sub">{PRO.yearly} · every Free feature, plus:</p>
          <ul className="plan-list">
            <li>300 dpi Pro OCR — reads 8 pt footers and bad scans</li>
            <li>300 dpi Flatten for print shops &amp; portals</li>
            <li>432 dpi page export for design &amp; print</li>
            <li>Bad-scan cleanup before OCR</li>
            <li>Word→PDF with bold & italics kept</li>
            <li>Batch folders, API keys, certified e-sign (next)</li>
          </ul>
          {PRO.stripeLink
            ? <a className="btn" href={PRO.stripeLink} rel="nofollow">Go Pro →</a>
            : <a className="btn" href="#waitlist">Get launch access →</a>}
        </div>
      </div>
      <div className="card" style={{ overflowX: 'auto' }}>
        <table className="cmp-table">
          <thead><tr><th></th><th>Free</th><th>Pro</th></tr></thead>
          <tbody>{rows.map(([label, f, p], i) => <tr key={i}><td>{label}</td><td>{cell(f)}</td><td>{cell(p)}</td></tr>)}</tbody>
        </table>
      </div>
      <div className="card">
        <h2 className="section-h">Pricing questions, answered honestly</h2>
        {faqs.map(([q, a], i) => (
          <details key={i} className="faq"><summary>{q}</summary><p>{a}</p></details>
        ))}
      </div>
      {!PRO.stripeLink && (
        <div className="card" id="waitlist" style={{ maxWidth: 760, margin: '0 auto 30px' }}>
          <EmailCapture
            tool="abetpdf-pro-launch"
            headline="AbetPDF Pro opens soon — grab founder pricing"
            sub="One email when Pro goes live (with the lifetime discount), nothing else."
          />
        </div>
      )}
    </>
  );
}
