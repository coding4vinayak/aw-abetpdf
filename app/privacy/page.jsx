export const metadata = { title: 'Privacy Policy', description: 'AbetPDF processes everything in your browser — here is the whole story.' };

const S = { maxWidth: 760, margin: '0 auto' };
const H = { fontSize: 17, margin: '26px 0 8px' };
const P = { fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.65 };

export default function Privacy() {
  return (
    <div className="card" style={S}>
      <h1 className="tool-title" style={{ fontSize: 24 }}>Privacy Policy — AbetPDF</h1>
      <p style={P}>last updated September 2026</p>
      <h2 style={H}>The short version</h2>
      <p style={P}>
        AbetPDF runs entirely inside your browser tab. The PDF and image files you drop are read by
        JavaScript on your device (pdf-lib / pdf.js) and processed there. They are never transmitted
        to a server, stored, logged or seen by anyone — including us. There is no upload step to opt out of.
      </p>
      <h2 style={H}>What we do collect</h2>
      <p style={P}>
        Standard, privacy-respecting hosting analytics (aggregate page counts). No advertising
        trackers, no cookies for profiling. If you email us from a contact address, that correspondence is kept.
      </p>
      <h2 style={H}>Children, terms, contact</h2>
      <p style={P}>A general-audience tool; no accounts. Questions: privacy@abetworks.in · Part of the Abetworks family.</p>
    </div>
  );
}
