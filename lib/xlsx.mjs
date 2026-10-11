import JSZip from 'jszip';

const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

function colIdx(ref) {
  const letters = ref.match(/^[A-Z]+/)[0];
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export async function xlsxSheets(arrayBuffer) {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const ss = [];
  const ssPart = zip.file('xl/sharedStrings.xml');
  if (ssPart) {
    const sx = await ssPart.async('string');
    for (const m of sx.matchAll(/<si(?: [^>]*)?>([\s\S]*?)<\/si>/g)) {
      ss.push([...m[1].matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((x) => unesc(x[1])).join(''));
    }
  }
  const names = [];
  const wb = zip.file('xl/workbook.xml');
  if (wb) {
    const wx = await wb.async('string');
    for (const m of wx.matchAll(/<sheet [^>]*name="([^"]*)"/g)) names.push(unesc(m[1]));
  }
  const sheetFiles = Object.keys(zip.files)
    .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort((a, b) => +a.match(/\d+/)[0] - +b.match(/\d+/)[0]);
  const out = [];
  for (let si = 0; si < sheetFiles.length; si++) {
    const xml = await zip.file(sheetFiles[si]).async('string');
    const rows = [];
    for (const rm of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>|<row[^>]*\/>/g)) {
      const body = rm[1] || '';
      const cells = [];
      for (const cm of body.matchAll(/<c r="([A-Z]+\d+)"((?:[^>](?!\/>))*)>([\s\S]*?)<\/c>|<c r="([A-Z]+\d+)"([^>]*?)\/>/g)) {
        const ref = cm[1] || cm[4];
        const attrs = (cm[2] || cm[5] || '');
        const inner = cm[3] || '';
        const vM = inner.match(/<v[^>]*>([^<]*)<\/v>/);
        const tM = attrs.match(/t="([^"]+)"/);
        let val = '';
        if (tM && tM[1] === 's' && vM) val = ss[+vM[1]] || '';
        else if (tM && tM[1] === 'inlineStr') { const im = inner.match(/<t[^>]*>([^<]*)<\/t>/); val = im ? unesc(im[1]) : ''; }
        else if (vM) val = vM[1];
        else { const im = inner.match(/<t[^>]*>([^<]*)<\/t>/); if (im) val = unesc(im[1]); }
        cells.push({ col: colIdx(ref), val: String(val) });
      }
      rows.push(cells);
    }
    out.push({ name: names[si] || `Sheet ${si + 1}`, rows });
  }
  return out;
}
