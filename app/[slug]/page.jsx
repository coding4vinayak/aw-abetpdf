import { notFound } from 'next/navigation';
import { TOOLS, TOOL_BY_SLUG } from '../../lib/tools';
import ToolWidget from '../../components/Widgets';

export function generateStaticParams() {
  return TOOLS.map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const tool = TOOL_BY_SLUG[slug];
  if (!tool) return {};
  return {
    title: `${tool.name} — free, no upload`,
    description: tool.desc,
    alternates: { canonical: { url: `/${tool.slug}`, absolute: false } },
    openGraph: { title: `${tool.name} — AbetPDF`, description: tool.desc, type: 'website', siteName: 'AbetPDF', images: ['/og.png'] },
    twitter: { card: 'summary_large_image', title: `${tool.name} — AbetPDF`, description: tool.desc, images: ['/og.png'] },
  };
}

export default async function ToolPage({ params }) {
  const { slug } = await params;
  const tool = TOOL_BY_SLUG[slug];
  if (!tool) notFound();
  const sibs = TOOLS.filter((t) => t.slug !== slug).slice(0, 6);
  const faqLd = {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: tool.faqs.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
  };
  const appLd = {
    '@context': 'https://schema.org', '@type': 'SoftwareApplication',
    name: `${tool.name} by AbetPDF`, description: tool.desc,
    applicationCategory: 'UtilitiesApplication', operatingSystem: 'Any (web browser)',
    features: 'Runs entirely in the browser — files are never uploaded',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  };
  return (
    <article>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(appLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      <div className="tool-hero">
        <a className="back" href="/">← All AbetPDF tools</a>
        <p className="eyebrow">AbetPDF · by Abetworks · 100% local</p>
        <h1 className="tool-title">{tool.emoji} {tool.name} <span className="tc-tier free">FREE</span></h1>
        <p className="tool-tagline">{tool.tagline}</p>
        <div className="trust-strip">
          <span>✓ No upload — ever</span>
          <span>✓ Unlimited, no watermark</span>
          <span>✓ Works on any device once loaded</span>
        </div>
      </div>
      <ToolWidget slug={slug} />
      <div className="card">
        <h2 className="section-h">How it works</h2>
        <ol className="how-list">{tool.how.map((s, i) => <li key={i}>{s}</li>)}</ol>
      </div>
      <div className="card">
        <h2 className="section-h">Frequently asked questions</h2>
        {tool.faqs.map(([q, a], i) => (
          <details key={i} className="faq" open={i === 0}><summary>{q}</summary><p>{a}</p></details>
        ))}
      </div>
      <div className="upsell">
        <div>
          <p className="eyebrow" style={{ color: '#a5b4fc', marginTop: 0 }}>Made by Abetworks</p>
          <h4>Abetworks Hub — 35 business tools</h4>
          <p>AI-visibility checks, deliverability diagnostics, churn risk and more. Five free forever.</p>
        </div>
        <a href="https://hub.abetworks.in/">Visit the hub →</a>
      </div>
      <div className="card">
        <h2 className="section-h">Other PDF tools — also private</h2>
        <div className="tool-grid">
          {sibs.map((t) => (
            <a key={t.slug} className="tool-card" href={`/${t.slug}`}>
              <div className="tc-name">{t.emoji} {t.name}</div>
              <div className="tc-desc">{t.tagline}</div>
            </a>
          ))}
        </div>
      </div>
    </article>
  );
}
