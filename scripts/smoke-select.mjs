import { PDFDocument } from '@cantoo/pdf-lib';

// Mirror of parseRanges in components/Widgets.jsx — keep in sync.
function parseRanges(text, total) {
  const out = new Set();
  for (const part of String(text || '').split(/[,;]+/)) {
    const m = part.trim().match(/^(\d+)\s*(?:-\s*(\d+)?)?$/);
    if (!m) continue;
    const a = +m[1], b = m[2] !== undefined ? +m[2] : (m[0].includes('-') ? total : a);
    for (let i = a; i <= Math.min(b, total); i++) if (i >= 1) out.add(i - 1);
  }
  return out;
}

let pass = 0, fail = 0;
const check = (name, ok) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); };

// 1. Range syntax
check('singles', [...parseRanges('2, 4', 6)].join(',') === '1,3');
check('closed range', [...parseRanges('2-4', 6)].join(',') === '1,2,3');
check('open-ended 5-', [...parseRanges('5-', 6)].join(',') === '4,5');
check('open range spaced "3 -"', [...parseRanges('3 -', 5)].join(',') === '2,3,4');
check('out-of-range clamped', [...parseRanges('4-99', 5)].join(',') === '3,4');
check('garbage ignored', [...parseRanges('abc, 2', 5)].join(',') === '1');
check('zero/below ignored', [...parseRanges('0-2', 5)].join(',') === '0,1');
check('dedup', [...parseRanges('2,2-3', 5)].join(',') === '1,2');
check('semicolons', [...parseRanges('1;3', 5)].join(',') === '0,2');

// 2. Selection roundtrip on a real PDF
const src = await PDFDocument.create();
for (let i = 0; i < 6; i++) src.addPage([300 + i, 600]).drawText(`P${i + 1}`);
const bytes = await src.save();
const d = await PDFDocument.load(bytes);
let keep = [...parseRanges('1-2,5', 6)];
const n = await PDFDocument.create();
(await n.copyPages(d, keep)).forEach((p) => n.addPage(p));
const sel = await PDFDocument.load(await n.save());
check('select 1-2,5 → 3 pages', sel.getPageCount() === 3);
check('sizes carried over', sel.getPages().map((p) => p.getSize().width).join(',') === '300,301,304');

// 3. Reverse
keep = keep.slice().reverse();
const r = await PDFDocument.create();
(await r.copyPages(d, keep)).forEach((p) => r.addPage(p));
const rev = await PDFDocument.load(await r.save());
check('reversed order', rev.getPages().map((p) => p.getSize().width).join(',') === '304,301,300');

// 4. Add margins via embedPdf + drawPage
const out = await PDFDocument.create();
const embedded = await out.embedPdf(bytes, d.getPageIndices());
const m = 28;
embedded.forEach((ref, i) => {
  const { width, height } = d.getPage(i).getSize();
  const pg = out.addPage([width + 2 * m, height + 2 * m]);
  pg.drawPage(ref, { x: m, y: m, width, height });
});
const framed = await PDFDocument.load(await out.save());
check('all pages framed', framed.getPageCount() === 6);
const s0 = framed.getPage(0).getSize(), s1 = framed.getPage(1).getSize();
check('page 1 grew by 2m', s0.width === 300 + 56 && s0.height === 600 + 56);
check('per-page sizes kept', s1.width === 301 + 56);

// 5. Text stays selectable after framing (pdf.js extraction, no rasterising)
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
const fr = await pdfjs.getDocument({
  data: new Uint8Array(await out.save()),
  standardFontDataUrl: `${process.cwd()}/node_modules/pdfjs-dist/standard_fonts/`,
}).promise;
const tc = await (await fr.getPage(1)).getTextContent();
const text = tc.items.map((i) => i.str).join('');
check('text selectable after margins', text.includes('P1'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
