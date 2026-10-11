import { PDFDocument } from '@cantoo/pdf-lib';
import { imposeBooklet } from '../lib/booklet.mjs';

let pass = 0, fail = 0;
const check = (name, ok) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); };

// 1. Imposition order — 6 pages padded to 8
const sheets = imposeBooklet(new Array(6).fill({ width: 400, height: 600 }));
check('8 pages → 4 sheets', sheets.length === 4);
check('sheet order', sheets.map((s) => s.pages.join(',')).join(' / ')
  === '7,0 / 1,6 / 5,2 / 3,4');
check('landscape sheets', sheets.every((s) => s.width === 800 && s.height === 600));

// 2. Multiple of 4 — 8 pages
const s8 = imposeBooklet(new Array(8).fill({ width: 400, height: 600 }));
check('8 pages order', s8.map((s) => s.pages.join(',')).join(' / ')
  === '7,0 / 1,6 / 5,2 / 3,4');

// 3. Single page
const s1 = imposeBooklet([{ width: 400, height: 600 }]);
check('1 page → 1 sheet, page 0 on front right', s1.length === 2 && s1[0].pages.join(',') === '3,0');

// 4. Real imposition via pdf-lib (embedPdf + drawPage availability + output parses)
const src = await PDFDocument.create();
for (let i = 0; i < 6; i++) {
  const pg = src.addPage([400, 600]);
  pg.drawText(`P${i + 1}`);
}
const srcBytes = await src.save();
const out = await PDFDocument.create();
const embedded = await out.embedPdf(srcBytes, [0, 1, 2, 3, 4, 5]);
check('embedPdf returns 6 refs', embedded.length === 6);
sheets.forEach((sheet) => {
  const pg = out.addPage([sheet.width, sheet.height]);
  sheet.pages.forEach((idx, pos) => {
    if (idx >= 6) return;
    pg.drawPage(embedded[idx], { x: pos * 400, y: 0, width: 400, height: 600 });
  });
});
const outBytes = await out.save();
const reload = await PDFDocument.load(outBytes);
check('imposed PDF reloads', reload.getPageCount() === 4);
check('sheet size kept', (() => { const { width, height } = reload.getPage(0).getSize(); return width === 800 && height === 600; })());
check('output non-trivial', outBytes.length > 1000);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
