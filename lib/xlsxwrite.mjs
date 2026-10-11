import JSZip from 'jszip';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const RNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

function colLetter(i) {
  let s = '';
  i += 1;
  while (i > 0) {
    const r = (i - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    i = Math.floor((i - 1) / 26);
  }
  return s;
}

const NUMERIC = /^-?\d+(\.\d+)?$/;

function sheetName(name, i) {
  const clean = String(name || `Sheet ${i + 1}`).replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31) || `Sheet ${i + 1}`;
  return clean;
}

function sheetXmlFinal(rows) {
  const nCols = rows.reduce((a, r) => Math.max(a, r.length), 0);
  const widths = new Array(nCols).fill(9);
  for (const r of rows) for (let c = 0; c < r.length; c++) {
    const len = String(r[c] ?? '').length;
    if (len + 2 > widths[c]) widths[c] = Math.min(60, len + 2);
  }
  const cols = nCols ? `<cols>${widths.map((w, c) => `<col min="${c + 1}" max="${c + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
  const body = rows.map((r, ri) => {
    const cells = [];
    for (let c = 0; c < r.length; c++) {
      const v = r[c];
      if (v === null || v === undefined || v === '') continue;
      const ref = `${colLetter(c)}${ri + 1}`;
      const s = String(v);
      if (NUMERIC.test(s) && s.length < 16) cells.push(`<c r="${ref}"><v>${s}</v></c>`);
      else cells.push(`<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(s)}</t></is></c>`);
    }
    return cells.length ? `<row r="${ri + 1}">${cells.join('')}</row>` : '';
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="${NS}">${cols}<sheetData>${body}</sheetData></worksheet>`;
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="${NS}"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

export async function buildXlsxBytes(sheets, outType = 'blob') {
  const zip = new JSZip();
  const list = sheets.map((s, i) => ({ name: sheetName(s.name, i), rows: s.rows.map((r) => r.map((c) => (c === null || c === undefined ? '' : String(c).replace(/\s+/g, ' ').trim()))) }));
  zip.file('[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${list.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  zip.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="${NS}" xmlns:r="${RNS}"><sheets>${list.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`);
  zip.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${list.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${list.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  zip.file('xl/styles.xml', STYLES);
  list.forEach((s, i) => zip.file(`xl/worksheets/sheet${i + 1}.xml`, sheetXmlFinal(s.rows)));
  return zip.generateAsync({ type: outType === 'nodebuffer' ? 'nodebuffer' : 'blob' });
}
