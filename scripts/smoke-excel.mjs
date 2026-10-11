import { extractPageTable } from '../lib/table-extract.mjs';
import { buildXlsxBytes } from '../lib/xlsxwrite.mjs';
import { xlsxSheets } from '../lib/xlsx.mjs';

const it = (str, x, topY, pageH, w) => ({
  str, transform: [1, 0, 0, 1, x, pageH - topY], width: w ?? str.length * 6, height: 10,
});

let pass = 0, fail = 0;
const check = (name, ok) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); };

// 1. Aligned 3-column invoice table
const pageH = 800;
const items = [];
const rows = [
  ['Item', 'Qty', 'Price'],
  ['Widget', '12', '240.00'],
  ['Gadget', '3', '99.50'],
  ['Doohickey', '7', '61.25'],
];
rows.forEach((r, ri) => {
  const xs = [60, 300, 420];
  r.forEach((cell, ci) => items.push(it(cell, xs[ci], 80 + ri * 18, pageH)));
});
const t = extractPageTable(items, pageH);
check('table detected', t.tabular === true);
check('4 rows', t.rows.length === 4);
check('3 cols', t.rows.every((r) => r.length === 3));
check('header row', t.rows[0].join('|') === 'Item|Qty|Price');
check('numeric cell', t.rows[1][1] === '12');

// 2. Prose paragraph → single column, not tabular
const prose = [];
for (let i = 0; i < 5; i++) prose.push(it('A long line of flowing narrative prose that runs across the page.', 60, 80 + i * 14, pageH, 500));
const p = extractPageTable(prose, pageH);
check('prose not tabular', p.tabular === false);
check('prose one cell per line', p.rows.length === 5 && p.rows.every((r) => r.length === 1));

// 3. Empty page
check('empty page', extractPageTable([], pageH).rows.length === 0);

// 4. xlsx roundtrip: build workbook, re-parse with our own reader
const wb = await buildXlsxBytes([
  { name: 'Page 1', rows: t.rows },
  { name: 'Page 2', rows: [['note', 'text with <tag> & "quotes"', ''], ['x', '42.5', 'y']] },
], 'nodebuffer');
const back = await xlsxSheets(wb);
const cell = (sheet, r, c) => (back[sheet].rows[r] || []).find((x) => x.col === c)?.val ?? '';
check('roundtrip 2 sheets', back.length === 2);
check('roundtrip header', cell(0, 0, 0) === 'Item' && cell(0, 0, 1) === 'Qty' && cell(0, 0, 2) === 'Price');
check('roundtrip escaped text', cell(1, 0, 1) === 'text with <tag> & "quotes"');
check('roundtrip numeric', cell(1, 1, 1) === '42.5');
check('valid zip header', wb.slice(0, 2).toString() === 'PK');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
