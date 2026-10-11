export const metadata = { title: 'Terms of Service', description: 'Simple terms for a simple promise: local PDF tools, free.' };

const S = { maxWidth: 760, margin: '0 auto' };
const P = { fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.65 };

export default function Terms() {
  return (
    <div className="card" style={S}>
      <h1 className="tool-title" style={{ fontSize: 24 }}>Terms of Service — AbetPDF</h1>
      <p style={P}>
        Free for any use, personal or commercial — including the output documents you create.
        Provided “as is”, no warranty that results will be fit for a particular purpose; keep backups
        of originals. Don’t use the tool for illegal documents. We may add rate-limits on the hosting
        edge to stop abuse of page delivery, never on your files (we cannot see them). Liability
        capped at what you paid us (zero) unless the law says otherwise. Governing law: India, Bengaluru.
        Contact: legal@abetworks.in · © 2026 Abetworks.
      </p>
    </div>
  );
}
