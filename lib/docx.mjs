import JSZip from 'jszip';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

export function documentXml(pages) {
  const body = pages
    .map((lines, pi) => {
      const paras = lines.map((t) => `<w:p><w:r><w:t xml:space="preserve">${esc(t)}</w:t></w:r></w:p>`).join('');
      const brk = pi < pages.length - 1 ? '<w:p><w:r><w:br w:type="page"/></w:r></w:p>' : '';
      return paras + brk;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body || '<w:p/>'}</w:body></w:document>`;
}

export async function buildDocxBlob(pages) {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', CONTENT_TYPES);
  zip.folder('_rels').file('.rels', RELS);
  zip.folder('word').file('document.xml', documentXml(pages));
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', compression: 'DEFLATE' });
}

const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

export async function docxToParagraphs(arrayBuffer) {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const part = zip.file('word/document.xml');
  if (!part) throw new Error('That .docx has no document part — is it really a Word file?');
  const xml = await part.async('string');
  const paras = [];
  for (const m of xml.matchAll(/<w:p(?: [^>]*)?>([\s\S]*?)<\/w:p>/g)) {
    const body = m[1];
    const texts = [...body.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((x) => unesc(x[1]));
    const line = texts.join('').replace(/\s+/g, ' ').trim();
    if (body.includes('w:br w:type="page"')) { if (line) paras.push(line); paras.push(''); }
    else paras.push(line);
  }
  return paras.filter((x, i) => x !== '' || (paras[i - 1] !== '' && i));
}

export async function docxToRuns(arrayBuffer) {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const part = zip.file('word/document.xml');
  if (!part) throw new Error('That .docx has no document part — is it really a Word file?');
  const xml = await part.async('string');
  const out = [];
  for (const m of xml.matchAll(/<w:p(?: [^>]*)?>([\s\S]*?)<\/w:p>/g)) {
    const body = m[1];
    const runs = [];
    for (const r of body.matchAll(/<w:r(?: [^>]*)?>([\s\S]*?)<\/w:r>/g)) {
      const rb = r[1];
      const text = [...rb.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((x) => unesc(x[1])).join('');
      if (!text.trim()) continue;
      const bold = /<w:b(\s[^>]*?)?\/?>/.test(rb) && !/<w:b[^>]*w:val="(0|false|none)"/.test(rb);
      const italic = /<w:i(\s[^>]*?)?\/?>/.test(rb) && !/<w:i[^>]*w:val="(0|false|none)"/.test(rb);
      runs.push({ text, bold, italic });
    }
    if (body.includes('w:br w:type="page"')) { if (runs.length) out.push(runs); out.push(null); }
    else out.push(runs);
  }
  return out;
}
