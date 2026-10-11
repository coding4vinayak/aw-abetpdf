export default function NotFound() {
  return (
    <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
      <p className="eyebrow">404</p>
      <h1 className="tool-title" style={{ fontSize: 26 }}>That page does not exist</h1>
      <p className="tool-tagline">Every AbetPDF tool is one click away — and none of them will ever upload your files.</p>
      <p style={{ marginTop: 18 }}><a className="btn" href="/">← All PDF tools</a></p>
    </div>
  );
}
