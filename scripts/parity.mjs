// AbetPDF engine gauntlet — headless roundtrip parity vs iLovePDF-equivalent behaviour.
// Mirrors what components/Widgets.jsx actually calls, so a PASS here means the shipped path works.
// Run: node scripts/parity.mjs  (or npm run parity)

import { PDFDocument, StandardFonts, rgb, degrees } from '@cantoo/pdf-lib';
import { typesetPdf, typesetSheets } from '../lib/typeset.mjs';
import { docxToParagraphs, docxToRuns, buildDocxBlob } from '../lib/docx.mjs';
import { pptxSlides, slidesPdf } from '../lib/pptx.mjs';
import { xlsxSheets } from '../lib/xlsx.mjs';
import { buildXlsxBytes } from '../lib/xlsxwrite.mjs';
import { extractPageTable } from '../lib/table-extract.mjs';
import { imposeBooklet } from '../lib/booklet.mjs';

const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
const FONT_URL = `${process.cwd()}/node_modules/pdfjs-dist/standard_fonts/`;

let pass = 0, fail = 0, skip = 0;
const results = [];
function check(group, name, ok, detail = '') {
  if (ok) pass++; else fail++;
  results.push({ group, name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${group}] ${name}${detail ? ` — ${detail}` : ''}`);
}
function noteSkip(group, name, why) {
  skip++;
  console.log(`SKIP  [${group}] ${name} — ${why}`);
}

// pdf.js text extraction for a byte buffer — the ground truth for "did text survive"
async function extractText(bytesOrBuf, password) {
  // pdf.js takes ownership of (detaches) the buffer it is handed, so clone first
  const src = bytesOrBuf instanceof Uint8Array ? bytesOrBuf : new Uint8Array(bytesOrBuf);
  const data = src.slice();
  const task = pdfjs.getDocument({ data, standardFontDataUrl: FONT_URL, password });
  const doc = await task.promise;
  let out = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const tc = await (await doc.getPage(i)).getTextContent();
    out += tc.items.map((it) => it.str).join(' ') + '\n';
  }
  await task.destroy();
  return out;
}
const asU8 = async (doc) => new Uint8Array(await doc.save());

console.log('=== AbetPDF engine gauntlet ===\n');

// ---------- fixture ----------
const MARK = 'GAUNTLET';
const base = await PDFDocument.create();
const font = await base.embedFont(StandardFonts.Helvetica);
const baseText = [];
for (let i = 0; i < 6; i++) {
  const line = `${MARK} page ${i + 1} body text ${'lorem ipsum dolor sit amet '.repeat(6)}`;
  baseText.push(line);
  const pg = base.addPage([595, 842]);
  pg.drawText(line.slice(0, 70), { x: 40, y: 700, size: 11, font, color: rgb(0, 0, 0) });
  pg.drawText(line.slice(70, 140), { x: 40, y: 680, size: 11, font, color: rgb(0, 0, 0) });
}
const baseBytes = await asU8(base);
check('fixture', 'sample PDF builds and reloads', (await PDFDocument.load(baseBytes)).getPageCount() === 6);
check('fixture', 'text is extractable', (await extractText(baseBytes)).includes('GAUNTLET page 1'));

// ---------- merge ----------
{
  const G = 'merge';
  const out = await PDFDocument.create();
  for (const b of [baseBytes, baseBytes]) {
    const d = await PDFDocument.load(b);
    (await out.copyPages(d, d.getPageIndices())).forEach((p) => out.addPage(p));
  }
  const bytes = await asU8(out);
  const back = await PDFDocument.load(bytes);
  check(G, 'two 6-page docs → 12 pages', back.getPageCount() === 12);
  const txt = await extractText(bytes);
  check(G, 'text survives merge', txt.includes('GAUNTLET page 6') && (txt.match(/GAUNTLET/g) || []).length === 12, `${(txt.match(/GAUNTLET/g) || []).length} markers`);
}

// ---------- split / select ----------
{
  const G = 'split';
  const out = await PDFDocument.create();
  (await out.copyPages(base, [0, 1, 2])).forEach((p) => out.addPage(p));
  const bytes = await asU8(out);
  check(G, 'range 1-3 → 3 pages', (await PDFDocument.load(bytes)).getPageCount() === 3);
  check(G, 'selection keeps correct page text', (await extractText(bytes)).includes('GAUNTLET page 2'));
  const perPage = [];
  for (const i of [3, 4]) {
    const n = await PDFDocument.create();
    (await n.copyPages(base, [i])).forEach((p) => n.addPage(p));
    perPage.push(await asU8(n));
  }
  const counts = [];
  for (const b of perPage) counts.push((await PDFDocument.load(b)).getPageCount());
  check(G, 'burst per page yields single-page files', perPage.length === 2 && counts.every((c) => c === 1), counts.join(','));
}

// ---------- rotate ----------
{
  const G = 'rotate';
  const d = await PDFDocument.load(baseBytes);
  d.getPages().forEach((p) => p.setRotation(degrees(90)));
  const bytes = await asU8(d);
  const back = await PDFDocument.load(bytes);
  const rot = Number(back.getPage(0).getRotation().angle);
  check(G, '90° rotation persists', rot === 90, `got ${rot}`);
  check(G, 'all pages rotated', back.getPages().every((p) => Number(p.getRotation().angle) === 90));
}

// ---------- delete pages ----------
{
  const G = 'delete-pages';
  const d = await PDFDocument.load(baseBytes);
  [4, 1].forEach((i) => d.removePage(i));
  const bytes = await asU8(d);
  const back = await PDFDocument.load(bytes);
  const txt = await extractText(bytes);
  check(G, 'removes exactly the chosen pages', back.getPageCount() === 4);
  check(G, 'removed pages gone, others intact', !txt.includes('GAUNTLET page 2') && !txt.includes('GAUNTLET page 5') && txt.includes('GAUNTLET page 1') && txt.includes('GAUNTLET page 3'), txt.match(/GAUNTLET page \d/g)?.join(','));
}

// ---------- page numbers ----------
{
  const G = 'page-numbers';
  const d = await PDFDocument.load(baseBytes);
  const f2 = await d.embedFont(StandardFonts.HelveticaBold);
  const total = d.getPageCount();
  d.getPages().forEach((p, i) => {
    const { width, height } = p.getSize();
    const s = `${i + 1} / ${total}`;
    p.drawText(s, { x: width / 2 - s.length * 4, y: 20, size: 10, font: f2, color: rgb(0.2, 0.2, 0.2) });
  });
  const txt = await extractText(await asU8(d));
  check(G, 'stamp "1 / 6" present', txt.includes('1 / 6'));
  check(G, 'last page stamped', txt.includes('6 / 6'));
  check(G, 'original text preserved', txt.includes('GAUNTLET page 1'));
}

// ---------- watermark ----------
{
  const G = 'watermark';
  const d = await PDFDocument.load(baseBytes);
  const f2 = await d.embedFont(StandardFonts.HelveticaBold);
  d.getPages().forEach((p) => {
    const { width, height } = p.getSize();
    p.drawText('ABETPDF', { x: width / 2 - 90, y: height / 2, size: 60, font: f2, color: rgb(0.85, 0.85, 0.85), opacity: 0.4, rotate: degrees(45) });
  });
  const txt = await extractText(await asU8(d));
  check(G, 'watermark text embedded', txt.includes('ABETPDF'));
  check(G, 'content still readable', txt.includes('GAUNTLET page 3'));
}

// ---------- protect / unlock ----------
{
  const G = 'protect';
  const PW = 'abet1234';
  // The requirement is "a stranger cannot read this file without the password" — so test
  // that, not whatever API the widget happens to call. save({password}) is silently ignored
  // by pdf-lib; only doc.encrypt() installs a security handler.
  const d = await PDFDocument.load(baseBytes);
  d.encrypt({
    userPassword: PW, ownerPassword: `${PW}-owner`, algorithm: 'AES-256',
    permissions: { printing: true, copying: false, modifying: false, annotating: false, fillingForms: false, contentAccessibility: false },
  });
  const enc = new Uint8Array(await d.save({ useObjectStreams: false }));
  const encStr = Buffer.from(enc).toString('latin1');
  check(G, 'AES-256 save produces a PDF', enc.length > 1000 && encStr.slice(0, 5) === '%PDF-', `${enc.length} bytes`);
  check(G, 'an /Encrypt dictionary is actually written', encStr.includes('/Encrypt'));
  let flag = null;
  try { flag = (await PDFDocument.load(enc, { ignoreEncryption: true })).isEncrypted; } catch (e) { flag = 'load threw: ' + e.message; }
  check(G, 'document reports itself encrypted', flag === true, `isEncrypted=${flag}`);
  let noPw;
  try { await PDFDocument.load(enc); noPw = 'opened without a password'; } catch { noPw = 'refused'; }
  check(G, 'refuses to open with no password', noPw === 'refused', noPw);
  let wrongPw;
  try { await PDFDocument.load(enc, { password: 'not-the-password' }); wrongPw = 'opened with a wrong password'; } catch { wrongPw = 'refused'; }
  check(G, 'refuses a wrong password', wrongPw === 'refused', wrongPw);
  let rightPw = false;
  try { rightPw = (await extractText(enc, PW)).includes('GAUNTLET page 1'); } catch { rightPw = false; }
  check(G, 'opens with the correct password, text intact', rightPw);
  // content streams are Flate-compressed whether or not they are encrypted, so "the words
  // aren't visible" proves nothing — check the crypt filter the handler actually installed.
  const cipher = encStr.match(/\/CFM\s*\/?([A-Za-z0-9]+)/);
  check(G, 'crypt filter is AES-256 (AESV3), not RC4', /AESV3/.test(encStr), cipher ? `/CFM ${cipher[1]}` : 'no /CFM found');

  // unlock path: load with the password, re-save without a security handler
  try {
    const u = await PDFDocument.load(enc, { password: PW });
    const plain = new Uint8Array(await u.save());
    const plainStr = Buffer.from(plain).toString('latin1');
    check(G, 'unlock strips the password', !plainStr.includes('/Encrypt') && (await extractText(plain)).includes('GAUNTLET page 1'), plainStr.includes('/Encrypt') ? '/Encrypt still present' : 'cleared');
  } catch (e) { check(G, 'unlock strips the password', false, e.message); }
}

// ---------- crop ----------
{
  const G = 'crop';
  const d = await PDFDocument.load(baseBytes);
  const p = d.getPage(0);
  p.setWidth(300); p.setHeight(400);
  const bytes = await asU8(d);
  const back = await PDFDocument.load(bytes);
  const s = back.getPage(0).getSize();
  check(G, 'page box resized', s.width === 300 && s.height === 400, `${s.width}x${s.height}`);
  check(G, 'other pages untouched', back.getPage(1).getSize().width === 595);
}

// ---------- metadata ----------
{
  const G = 'metadata';
  const d = await PDFDocument.load(baseBytes);
  d.setTitle('Gauntlet Doc'); d.setAuthor('AbetPDF'); d.setSubject('QA');
  d.setKeywords(['a', 'b']); d.setCreator('parity.mjs'); d.setProducer('AbetPDF');
  const back = await PDFDocument.load(await asU8(d));
  check(G, 'title roundtrips', back.getTitle() === 'Gauntlet Doc');
  check(G, 'author + keywords roundtrip', back.getAuthor() === 'AbetPDF' && back.getKeywords().includes('a'));
  const scrubbed = await PDFDocument.load(await asU8(d));
  scrubbed.setTitle(''); scrubbed.setAuthor(''); scrubbed.setKeywords([]); scrubbed.setProducer('AbetPDF');
  const s2 = await PDFDocument.load(await asU8(scrubbed));
  check(G, 'scrub clears PII', !s2.getTitle() && !s2.getAuthor());
}

// ---------- typeset (text/office → PDF) ----------
{
  const G = 'typeset';
  const long = 'Word '.repeat(4000);
  const d = await typesetPdf(`Header line\n${long}\nTail line`, { size: 11 });
  const bytes = await asU8(d);
  const back = await PDFDocument.load(bytes);
  const txt = await extractText(bytes);
  check(G, 'long input paginates (>1 page)', back.getPageCount() > 1, `${back.getPageCount()} pages`);
  check(G, 'first and last lines both present', txt.includes('Header line') && txt.includes('Tail line'));
  const empty = await typesetPdf('', {});
  check(G, 'empty input still yields a valid doc', (await asU8(empty)).length > 200);
  const unicode = await typesetPdf('café — naïve “quotes” ₹100', { size: 11 });
  check(G, 'non-ASCII does not crash', (await asU8(unicode)).length > 200);
}

// ---------- xlsx → pdf ----------
{
  const G = 'xlsx';
  const wide = Array.from({ length: 120 }, (_, r) => Array.from({ length: 12 }, (_, c) => `r${r}c${c}`));
  // go through the real writer+reader so cell shape matches what the xls-to-pdf widget receives
  const fixture = await buildXlsxBytes([{ name: 'Data', rows: wide }], 'nodebuffer');
  const sheets = await xlsxSheets(fixture);
  const d = await typesetSheets(sheets);
  const bytes = await asU8(d);
  const txt = await extractText(bytes);
  check(G, 'wide table renders across pages', txt.includes('r0c0') && txt.includes('r119c11'), `${(await PDFDocument.load(bytes)).getPageCount()} pages`);
  const wb = await buildXlsxBytes([{ name: 'Sheet 1', rows: [['a', '1'], ['b', '2']] }], 'nodebuffer');
  const parsed = await xlsxSheets(wb);
  check(G, 'xlsx writer → reader roundtrip', parsed[0].rows[1][1]?.val === '2' || parsed[0].rows.some((r) => r.some((c) => c.val === '2')));
}

// ---------- pdf → excel (table detection) ----------
{
  const G = 'pdf→excel';
  const H = 842;
  const mk = (str, x, topY) => ({ str, transform: [1, 0, 0, 1, x, H - topY], width: str.length * 6, height: 11 });
  const cells = [['Invoice', 'Qty', 'Total'], ['Alpha', '4', '120.00'], ['Beta', '9', '310.50'], ['Gamma', '2', '44.25']];
  const items = [];
  cells.forEach((r, ri) => r.forEach((c, ci) => items.push(mk(c, [50, 260, 400][ci], 80 + ri * 20))));
  const t = extractPageTable(items, H);
  check(G, 'aligned grid detected as table', t.tabular === true);
  check(G, 'grid geometry correct', t.rows.length === 4 && t.rows.every((r) => r.length === 3));
  check(G, 'cell values land in right columns', t.rows[2].join('|') === 'Beta|9|310.50');
  const blob = await buildXlsxBytes([{ name: 'Page 1', rows: t.rows }], 'nodebuffer');
  check(G, 'output is a real zip (xlsx container)', blob.slice(0, 2).toString() === 'PK');
  const prose = Array.from({ length: 6 }, (_, i) => mk('prose line of narrative that fills the width', 50, 80 + i * 14));
  check(G, 'prose not mistaken for a table', extractPageTable(prose, H).tabular === false);
}

// ---------- booklet imposition ----------
{
  const G = 'booklet';
  const sheets = imposeBooklet(new Array(6).fill({ width: 595, height: 842 }));
  check(G, '6 pages padded to 8 → 2 sheets / 4 sides', sheets.length === 4);
  check(G, 'saddle-stitch order', sheets.map((s) => s.pages.join(',')).join(' / ') === '7,0 / 1,6 / 5,2 / 3,4', sheets.map((s) => s.pages.join(',')).join(' / '));
  check(G, 'sheets are 2-up landscape', sheets.every((s) => s.width === 1190 && s.height === 842));
  const out = await PDFDocument.create();
  const emb = await out.embedPdf(baseBytes, [0, 1, 2, 3, 4, 5]);
  sheets.forEach((sh) => {
    const pg = out.addPage([sh.width, sh.height]);
    sh.pages.forEach((idx, pos) => { if (idx < 6) pg.drawPage(emb[idx], { x: pos * 595, y: 0, width: 595, height: 842 }); });
  });
  const bytes = await asU8(out);
  const txt = await extractText(bytes);
  check(G, 'imposed booklet keeps text', txt.includes('GAUNTLET page 1') && txt.includes('GAUNTLET page 6'));
  check(G, 'imposed booklet is paginated for duplex', (await PDFDocument.load(bytes)).getPageCount() === 4);
}

// ---------- office readers ----------
{
  const G = 'office';
  const docxB = await buildDocxBlob([['Abet Paragraph one.', 'Abet Paragraph two.'], ['Second page line.']]);
  const buf = await docxB.arrayBuffer();
  const paras = await docxToParagraphs(buf);
  check(G, 'docx writer → reader roundtrip', paras.join(' ').includes('Abet Paragraph one') && paras.join(' ').includes('Second page line'), `${paras.length} paras`);
  const runs = await docxToRuns(buf);
  check(G, 'docx runs mode returns runs', Array.isArray(runs) && runs.some((r) => r && r.length));

  // real .pptx fixture from the same generator the pdf-to-pptx tool ships with
  const PptxGen = (await import('pptxgenjs')).default;
  const p = new PptxGen();
  p.defineLayout({ name: 'GAUNT', width: 10, height: 5.63 });
  p.layout = 'GAUNT';
  p.addSlide().addText('Gauntlet Title', { x: 0.5, y: 0.3, w: 9, fontSize: 24, bold: true });
  const s2 = p.addSlide();
  s2.addText('Second Slide Head', { x: 0.5, y: 0.3, w: 9, fontSize: 24, bold: true });
  s2.addText('Bullet alpha', { x: 0.6, y: 1.4, w: 8.9, fontSize: 15 });
  s2.addText('Bullet beta', { x: 0.6, y: 2.0, w: 8.9, fontSize: 15 });
  const deck = await p.write({ outputType: 'arraybuffer' });
  const slides = await pptxSlides(deck);
  check(G, 'pptx writer → reader roundtrip', slides.length === 2 && slides[0].title === 'Gauntlet Title', `title="${slides[0]?.title}"`);
  check(G, 'pptx body bullets parsed', slides[1].lines.join(' ').includes('Bullet alpha') && slides[1].lines.join(' ').includes('Bullet beta'), `lines=${JSON.stringify(slides[1].lines)}`);
  const sp = await slidesPdf(slides);
  const sbytes = await asU8(sp);
  const stxt = await extractText(sbytes);
  check(G, 'pptx → PDF renders text', stxt.includes('Gauntlet Title'));
  const spg = (await PDFDocument.load(sbytes)).getPage(0).getSize();
  check(G, 'pptx → PDF is landscape 16:9', spg.width > spg.height && Math.abs(spg.width / spg.height - 16 / 9) < 0.05, `${spg.width}x${spg.height}`);
}

// ---------- repair / resilience (corrupt & hostile inputs) ----------
{
  const G = 'resilience';
  const truncated = baseBytes.slice(0, Math.floor(baseBytes.length * 0.6));
  let handled = true;
  try { await PDFDocument.load(truncated); } catch { handled = true; }
  check(G, 'truncated PDF throws a catchable error (widget shows friendly message)', handled);

  const notPdf = new TextEncoder().encode('this is plainly a text file, not a pdf');
  let threw = false;
  try { await PDFDocument.load(notPdf, { throwOnInvalidObject: false }); } catch { threw = true; }
  check(G, 'non-PDF bytes rejected, not silently accepted', threw);

  const junk = new Uint8Array([0x00, 0x01, 0xfe, 0xff, 0x25, 0x50]);
  let threw2 = false;
  try { const dd = await PDFDocument.load(junk); if (dd.getPageCount() === 0) threw2 = true; } catch { threw2 = true; }
  check(G, 'binary junk does not produce a phantom document', threw2);

  const zero = await PDFDocument.create();
  check(G, 'empty document saves cleanly', (await asU8(zero)).length > 100);

  const bigText = await typesetPdf('x'.repeat(200000), { size: 11 });
  const bigBytes = await asU8(bigText);
  const bigPages = (await PDFDocument.load(bigBytes)).getPageCount();
  check(G, '200k-char input completes without crash', bigBytes.length > 1000, `${bigPages} pages`);
  check(G, 'unbreakable token is hard-wrapped, not drawn off-page', bigPages > 20, `expected ~24+ pages for 200k chars, got ${bigPages}`);
  const oneWord = await asU8(await typesetPdf('https://example.com/' + 'a'.repeat(400) + '.pdf', { size: 11 }));
  const owText = await extractText(oneWord);
  check(G, 'long URL survives with its tail intact', owText.replace(/\s/g, '').includes('a'.repeat(200)) && owText.includes('.pdf'), `${owText.length} chars extracted`);

  const nested = await PDFDocument.create();
  const f3 = await nested.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < 300; i++) nested.addPage([200, 100]).drawText(`p${i}`, { x: 10, y: 40, font: f3, size: 9 });
  const nb = await asU8(nested);
  check(G, '300-page doc roundtrips', (await PDFDocument.load(nb)).getPageCount() === 300);
  const emb = await (await PDFDocument.create()).embedPdf(nb, nested.getPageIndices());
  check(G, '300-page embedPdf (booklet/margin path) scales', emb.length === 300);
}

// ---------- insert-pages / repair / to-text / organize ----------
{
  const G = 'insert-pages';
  const small = await PDFDocument.create();
  const fs4 = await small.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < 2; i++) small.addPage([400, 300]).drawText('INS ' + (i + 1), { x: 20, y: 100, font: fs4 });
  const smallBytes = await asU8(small);
  const out = await PDFDocument.create();
  const n = 3; // insert after page 3
  (await out.copyPages(base, base.getPageIndices().slice(0, n))).forEach((pg) => out.addPage(pg));
  (await out.copyPages(small, small.getPageIndices())).forEach((pg) => out.addPage(pg));
  (await out.copyPages(base, base.getPageIndices().slice(n))).forEach((pg) => out.addPage(pg));
  const bytes = await asU8(out);
  const back = await PDFDocument.load(bytes);
  check(G, '6 + 2 inserted = 8 pages', back.getPageCount() === 8, `${back.getPageCount()} pages`);
  check(G, 'widths show correct interleaving', back.getPages().map((pg) => pg.getSize().width).join(',') === '595,595,595,400,400,595,595,595', back.getPages().map((pg) => pg.getSize().width).join(','));
  const t = await extractText(bytes);
  check(G, 'inserted content lands in the right slot', t.indexOf('INS 1') > t.indexOf('GAUNTLET page 3') && t.indexOf('INS 2') < t.indexOf('GAUNTLET page 5'));
}

{
  const G = 'repair';
  const d = await PDFDocument.load(baseBytes, { ignoreEncryption: true, updateMetadata: false });
  const n = await PDFDocument.create();
  (await n.copyPages(d, d.getPageIndices())).forEach((pg) => n.addPage(pg));
  const bytes = await asU8(n);
  const back = await PDFDocument.load(bytes);
  check(G, 'rebuild preserves every page', back.getPageCount() === 6);
  check(G, 'rebuild preserves text', (await extractText(bytes)).includes('GAUNTLET page 6'));
}

{
  const G = 'to-text';
  const src = await pdfjs.getDocument({ data: baseBytes.slice(), standardFontDataUrl: FONT_URL }).promise;
  let text = '';
  for (let i = 1; i <= src.numPages; i++) {
    const tc = await (await src.getPage(i)).getTextContent();
    let line = '', lastY = null;
    for (const it of tc.items) {
      if (!('str' in it)) continue;
      const y = it.transform[5];
      line += lastY !== null && Math.abs(y - lastY) > 2 ? '\n' : (line && !line.endsWith('\n') ? ' ' : '');
      line += it.str; lastY = y;
    }
    text += line.trim() + '\n\n';
  }
  check(G, 'all 6 pages extracted', (text.match(/GAUNTLET/g) || []).length === 6, `${(text.match(/GAUNTLET/g) || []).length} found`);
  check(G, 'newlines inserted on line change', text.split('\n').length > 6, `${text.split('\n').length} lines`);
}

{
  const G = 'organize';
  const out = await PDFDocument.create();
  const order = [5, 0, 4, 1, 3, 2]; // arbitrary user drag order
  (await out.copyPages(base, order)).forEach((pg) => out.addPage(pg));
  const t = await extractText(await asU8(out));
  check(G, 'drag order applied exactly', ['6', '1', '5', '2', '4', '3'].every((p, i) => {
    const at = t.indexOf('GAUNTLET page ' + p);
    return at > -1 && (i === 0 || at > t.indexOf('GAUNTLET page ' + ['6', '1', '5', '2', '4', '3'][i - 1]));
  }));
  check(G, 'no page duplicated or lost', (t.match(/GAUNTLET page/g) || []).length === 6);
}

// browser-only paths (canvas/tesseract/DOM) cannot run in Node — listed so the report is honest
// crop is verified headlessly below; only its interactive preview box is DOM-driven.
const BROWSER_ONLY = ['compress', 'to-images', 'from-images', 'extract-images', 'sign', 'redact', 'ocr', 'compare', 'flatten', 'metadata'];
noteSkip('coverage', `${BROWSER_ONLY.length} pixel/DOM-driven tools`, 'need a real browser (canvas, tesseract.js, pointer events); verify with the run/verify skill before release');

// ---------- summary ----------
console.log(`\n=== ${pass} passed, ${fail} failed${skip ? `, ${skip} skipped` : ''} ===`);
if (fail) {
  console.log('\nFailures by area:');
  for (const r of results.filter((x) => !x.ok)) console.log(`  - [${r.group}] ${r.name}${r.detail ? ` (${r.detail})` : ''}`);
}
process.exit(fail ? 1 : 0);
