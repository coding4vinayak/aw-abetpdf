// Real-browser verification. Node tests cannot exercise canvas / pdf.js-render / tesseract /
// pointer-event paths, so this drives the running site with Playwright and validates the bytes out.
//   node scripts/browser-verify.mjs [tool-slug ...]      (no args = every case below)
//   BASE_URL=http://127.0.0.1:4123 node scripts/browser-verify.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4123';
const FIX = process.env.FIX_DIR || '/tmp/abectorial/fix/';
const OUT = '/tmp/abectorial/rt/';
fs.mkdirSync(OUT, { recursive: true });
const f = (n) => FIX + n;

const FONT_URL = new URL('pdfjs-dist/standard_fonts/', import.meta.url).href;
let pass = 0, fail = 0;
const failures = [];
function check(group, label, cond, detail = '') {
  if (cond) { pass++; console.log(`PASS  [${group}] ${label}${detail ? ' — ' + detail : ''}`); }
  else { fail++; failures.push(`${group}: ${label}`); console.log(`FAIL  [${group}] ${label} ${detail ? '— ' + detail : ''}`); }
}

const u8 = (b) => (Buffer.isBuffer(b) ? new Uint8Array(b) : b);
const load = (b) => PDFDocument.load(u8(b));
const isPdf = (b) => b.slice(0, 5).toString('latin1') === '%PDF-';
const isJpeg = (b) => b[0] === 0xff && b[1] === 0xd8;
const isPng = (b) => b[0] === 0x89 && b[1] === 0x50;
const isZip = (b) => b[0] === 0x50 && b[1] === 0x4b;

async function extractPages(bytes) {
  const doc = await pdfjsLib.getDocument({ data: u8(bytes).slice(), standardFontDataUrl: FONT_URL }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) pages.push((await (await doc.getPage(i)).getTextContent()).items.map((c) => c.str || '').join(' '));
  return pages;
}
async function extractText(bytes) {
  return (await extractPages(bytes)).join('\n');
}

async function grab(page) {
  const links = await page.locator('a.fl-name').evaluateAll((els) => els.map((el) => ({ name: el.getAttribute('download'), href: el.href })));
  const out = [];
  for (const h of links) {
    const b64 = await page.evaluate(async (href) => {
      const buf = new Uint8Array(await (await fetch(href)).arrayBuffer());
      let s = '';
      for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      return btoa(s);
    }, h.href);
    const bytes = Buffer.from(b64, 'base64');
    fs.writeFileSync(path.join(OUT, h.name), bytes);
    out.push({ name: h.name, bytes });
  }
  return out;
}

async function uiError(page) {
  return (await page.locator('.error-note, .fail, [class*=error]').first().textContent().catch(() => null) || '').trim();
}

async function runTool(page, slug, files, { waitMs = 90000, before = null, btn = 'Run' } = {}) {
  await page.goto(`${BASE}/${slug}`, { waitUntil: 'networkidle' });
  const input = page.locator('input[type=file]').first();
  if (!(await input.count())) throw new Error(`${slug}: no file input`);
  await input.setInputFiles(files);
  if (before) await before(page);
  const runBtn = page.locator('button.btn', { hasText: btn }).first();
  if (!(await runBtn.count())) throw new Error(`${slug}: no "${btn}" button`);
  await runBtn.click();
  const link = page.locator('a.fl-name').first();
  try {
    await link.waitFor({ state: 'attached', timeout: waitMs });
  } catch {
    throw new Error(`${slug}: no output — UI said: ${(await uiError(page)) || '(no error shown)'}`);
  }
  await page.waitForTimeout(300);
  return grab(page);
}

const CASES = {
  // ---------- structural pdf-lib tools, driven through the real UI ----------
  merge: () => async (page) => {
    const o = await runTool(page, 'merge', [f('text.pdf'), f('wide.pdf')]);
    const d = await load(o[0].bytes);
    check('merge', '6 + 2 pages merged in the browser', d.getPageCount() === 8, `${d.getPageCount()}`);
    check('merge', 'valid PDF', isPdf(o[0].bytes));
  },
  split: () => async (page) => {
    const o = await runTool(page, 'split', [f('text.pdf')], { before: async (p) => { await p.locator('select').first().selectOption('all'); } });
    check('split', 'split-every-page gives 6 files', o.length === 6, `${o.length} files`);
    check('split', 'each part is a valid PDF', o.every((x) => isPdf(x.bytes)));
    const o2 = await runTool(page, 'split', [f('text.pdf')], { before: async (p) => { await p.locator('select').first().selectOption('range'); const i = p.locator('input:not([type=file])').first(); if (await i.count()) await i.fill('2-4'); } });
    const d2 = await load(o2[0].bytes);
    check('split', 'range mode extracts 2-4', d2.getPageCount() === 3, `${d2.getPageCount()}`);
  },
  'select-pages': () => async (page) => {
    const o = await runTool(page, 'select-pages', [f('text.pdf')], { before: async (p) => { const i = p.locator('input:not([type=file])').first(); if (await i.count()) await i.fill('1,3-4'); } });
    const d = await load(o[0].bytes);
    check('select-pages', 'range applied in browser', d.getPageCount() === 3, `${d.getPageCount()}`);
  },
  rotate: () => async (page) => {
    const o = await runTool(page, 'rotate', [f('text.pdf')]);
    const d = await load(o[0].bytes);
    check('rotate', '90° on every page', d.getPages().every((p) => p.getRotation().angle === 90));
  },
  'delete-pages': () => async (page) => {
    const o = await runTool(page, 'delete-pages', [f('text.pdf')], { before: async (p) => { const i = p.locator('input:not([type=file])').first(); if (await i.count()) await i.fill('2'); } });
    const d = await load(o[0].bytes);
    check('delete-pages', 'page removed', d.getPageCount() === 5, `${d.getPageCount()}`);
  },
  'page-numbers': () => async (page) => {
    const o = await runTool(page, 'page-numbers', [f('text.pdf')]);
    check('page-numbers', 'footer numbers written', /[1-6]/.test(await extractText(o[0].bytes)));
  },
  watermark: () => async (page) => {
    const o = await runTool(page, 'watermark', [f('text.pdf')], { before: async (p) => { const i = p.locator('input:not([type=file])').first(); if (await i.count()) await i.fill('ABET-DEMO'); } });
    const t = await extractText(o[0].bytes);
    check('watermark', 'watermark text drawn', t.includes('ABET-DEMO'), JSON.stringify(t.replace(/\s+/g, ' ').trim().slice(0, 70)));
  },
  crop: () => async (page) => {
    const o = await runTool(page, 'crop', [f('text.pdf')]);
    const m = o[0].bytes.toString('latin1').match(/\/CropBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
    check('crop', 'a CropBox was written', !!m, m ? m[0] : 'none in bytes');
    if (m) {
      const w = +m[3] - +m[1], h = +m[4] - +m[2];
      check('crop', 'crop box trimmed by the 36pt margins', Math.abs(w - 523) < 1 && Math.abs(h - 770) < 1, `${w}x${h}`);
    }
    check('crop', 'vector crop keeps text selectable', (await extractText(o[0].bytes)).includes('BROWSER PROOF'));
  },
  repair: () => async (page) => {
    fs.writeFileSync(f('broken.pdf'), fs.readFileSync(f('text.pdf')).subarray(0, 900));
    const o = await runTool(page, 'repair', [f('broken.pdf')]);
    const d = await load(o[0].bytes);
    check('repair', 'truncated input rebuilt into a valid PDF', isPdf(o[0].bytes) && d.getPageCount() >= 1, `${d.getPageCount()} pages`);
  },
  'insert-pages': () => async (page) => {
    const o = await runTool(page, 'insert-pages', [f('text.pdf'), f('wide.pdf')], { before: async (p) => { const i = p.locator('input:not([type=file])').first(); if (await i.count()) await i.fill('3'); } });
    const d = await load(o[0].bytes);
    check('insert-pages', '8 pages after insert', d.getPageCount() === 8, `${d.getPageCount()}`);
  },
  'to-text': () => async (page) => {
    const o = await runTool(page, 'to-text', [f('text.pdf')]);
    const t = o[0].bytes.toString('utf8');
    check('to-text', 'all 6 pages in .txt', (t.match(/BROWSER PROOF/g) || []).length === 6);
    check('to-text', 'multi-line layout preserved', t.split('\n').length > 6);
  },
  'txt-to-pdf': () => async (page) => {
    fs.writeFileSync(f('note.txt'), 'Quarterly report\nRevenue rose 42 percent this year.\n\nA second paragraph after a blank line.\n');
    const o = await runTool(page, 'txt-to-pdf', [f('note.txt')]);
    const t = await extractText(o[0].bytes);
    check('txt-to-pdf', 'text typeset into a PDF', t.includes('Revenue rose 42'), JSON.stringify(t.replace(/\s+/g, ' ').trim().slice(0, 60)));
  },
  'add-margins': () => async (page) => {
    const o = await runTool(page, 'add-margins', [f('text.pdf')]);
    const d = await load(o[0].bytes);
    check('add-margins', 'page grew', d.getPage(0).getSize().width > 595, `${Math.round(d.getPage(0).getSize().width)}pt`);
  },
  booklet: () => async (page) => {
    const o = await runTool(page, 'booklet', [f('text.pdf')]);
    const d = await load(o[0].bytes);
    d.getPages().forEach((_, i) => {});
    check('booklet', '6 pages pad to an 8-slot signature = 4 printed sides', d.getPageCount() === 4, `${d.getPageCount()}`);
    check('booklet', 'each side is a landscape double-wide spread', d.getPages().every((p) => p.getSize().width > p.getSize().height), `${Math.round(d.getPage(0).getSize().width)}x${Math.round(d.getPage(0).getSize().height)}`);
  },
  protect: () => async (page) => {
    const o = await runTool(page, 'protect', [f('text.pdf')], { before: async (p) => { await p.locator('input[type=password]').first().fill('Str0ng-Pass!2026'); } });
    check('protect', 'encrypted PDF produced', isPdf(o[0].bytes) && o[0].bytes.toString('latin1').includes('/Encrypt'));
    const short = await (async () => { try { return await runTool(page, 'protect', [f('text.pdf')], { waitMs: 8000, before: async (p) => { await p.locator('input[type=password]').first().fill('ab'); } }); } catch (e) { return e.message; } })();
    check('protect', 'weak password refused with guidance', typeof short === 'string' && /at least 4/.test(short), String(short).slice(0, 90));
  },
  unlock: () => async (page) => {
    const o = await runTool(page, 'protect', [f('text.pdf')], { before: async (p) => { await p.locator('input[type=password]').first().fill('Str0ng-Pass!2026'); } });
    fs.writeFileSync(f('locked.pdf'), o[0].bytes);
    const wrong = await (async () => { try { return await runTool(page, 'unlock', [f('locked.pdf')], { waitMs: 8000, before: async (p) => { await p.locator('input[type=password]').first().fill('wrong-pass'); } }); } catch (e) { return e.message; } })();
    check('unlock', 'wrong password rejected, not silently accepted', typeof wrong === 'string' && /incorrect/i.test(wrong), String(wrong).slice(0, 90));
    const right = await runTool(page, 'unlock', [f('locked.pdf')], { before: async (p) => { await p.locator('input[type=password]').first().fill('Str0ng-Pass!2026'); } });
    check('unlock', 'correct password opens it', (await extractText(right[0].bytes)).includes('BROWSER PROOF'));
  },

  // ---------- pixel / canvas paths (untestable in Node) ----------
  compress: () => async (page) => {
    const light = await runTool(page, 'compress', [f('text.pdf')]);
    check('compress', 'light mode keeps selectable text', (await extractText(light[0].bytes)).includes('BROWSER PROOF'));
    const strong = await runTool(page, 'compress', [f('text.pdf')], { before: async (p) => { await p.locator('select').first().selectOption('balanced'); } });
    const d = await load(strong[0].bytes);
    check('compress', 'balanced mode rasterises all 6 pages', d.getPageCount() === 6, `${d.getPageCount()}`);
    check('compress', 'balanced mode destroys the text layer', !(await extractText(strong[0].bytes)).includes('BROWSER PROOF'));
    check('compress', 'balanced output is a real PDF', isPdf(strong[0].bytes), `${strong[0].bytes.length}B from ${fs.statSync(f('text.pdf')).size}B`);
  },
  'to-images': () => async (page) => {
    const o = await runTool(page, 'to-images', [f('text.pdf')]);
    check('to-images', 'one image per page', o.length === 6, o.map((x) => x.name).join(','));
    check('to-images', 'real JPEG/PNG bytes', o.every((x) => isJpeg(x.bytes) || isPng(x.bytes)));
    check('to-images', 'images have substance', o.every((x) => x.bytes.length > 2000), o.map((x) => x.bytes.length).join(','));
  },
  'from-images': () => async (page) => {
    const o = await runTool(page, 'from-images', [f('scan-a.png'), f('scan-b.png'), f('big.png')]);
    const d = await load(o[0].bytes);
    check('from-images', '3 images became 3 pages', d.getPageCount() === 3, `${d.getPageCount()}`);
    const sizes = d.getPages().map((p) => `${Math.round(p.getSize().width)}x${Math.round(p.getSize().height)}`);
    check('from-images', 'each page sized to its own image', new Set(sizes).size === 3, sizes.join(' '));
  },
  'extract-images': () => async (page) => {
    const o = await runTool(page, 'extract-images', [f('with-image.pdf')], { before: async (p) => { const c = p.locator('input[type=checkbox]').first(); if (await c.count()) await c.check(); } });
    check('extract-images', 'embedded image recovered', o.length >= 1, o.map((x) => x.name).join(','));
    check('extract-images', 'recovered file is a decodable image', o.every((x) => isPng(x.bytes) || isJpeg(x.bytes)));
    check('extract-images', 'not a blank thumbnail', o[0].bytes.length > 5000, `${o[0].bytes.length}B`);
  },
  flatten: () => async (page) => {
    const o = await runTool(page, 'flatten', [f('text.pdf')]);
    const d = await load(o[0].bytes);
    check('flatten', 'all pages rasterised', d.getPageCount() === 6);
    check('flatten', 'text layer destroyed by flattening', !(await extractText(o[0].bytes)).includes('BROWSER PROOF'));
  },
  ocr: () => async (page) => {
    // scanned-real.pdf is a browser-rendered page photographed back into an image-only PDF,
    // so it carries real letterforms for tesseract to find (the hand-drawn bar fixture has none).
    const o = await runTool(page, 'ocr', [f('scanned-real.pdf')], { waitMs: 240000, btn: 'searchable' });
    const d = await load(o[0].bytes);
    check('ocr', 'searchable PDF, 2 pages', d.getPageCount() === 2, `${d.getPageCount()}`);
    const t = await extractText(o[0].bytes);
    check('ocr', 'invisible text layer written', t.trim().length > 0, JSON.stringify(t.trim().slice(0, 40)));
    // pdf.js emits one item per word, so the recovered text has runs of spaces between words
    const flat = t.replace(/\s+/g, ' ');
    check('ocr', 'words actually recognised, not blank boxes', /BROWSER/i.test(flat) && /quick brown fox/i.test(flat), JSON.stringify(flat.trim().slice(0, 70)));
  },

  // ---------- pointer-driven UI ----------
  organize: () => async (page) => {
    await page.goto(`${BASE}/organize`, { waitUntil: 'networkidle' });
    await page.locator('input[type=file]').first().setInputFiles([f('text.pdf')]);
    await page.locator('.org-num').first().waitFor({ timeout: 30000 });
    const rows = await page.locator('.org-num').count();
    const ups = page.locator('button.mini', { hasText: '↑' });
    await ups.nth(1).click();
    await page.locator('button.btn', { hasText: 'Export' }).click();
    await page.locator('a.fl-name').first().waitFor({ timeout: 30000 });
    const o = await grab(page);
    const d = await load(o[0].bytes);
    check('organize', 'one control row per page', rows === 6, `${rows} rows`);
    check('organize', 'reorder exports with nothing lost', d.getPageCount() === 6, `${d.getPageCount()}`);
    const t = await extractText(o[0].bytes);
    check('organize', 'the dragged page actually moved', t.indexOf('page 0') > t.indexOf('page 1'), 'order changed as dragged');
  },
  sign: () => async (page) => {
    await page.goto(`${BASE}/sign`, { waitUntil: 'networkidle' });
    await page.locator('input[type=file]').first().setInputFiles([f('text.pdf')]);
    await page.locator('canvas').first().waitFor({ timeout: 30000 });
    await page.locator('canvas.sigpad').waitFor({ timeout: 30000 });
    await page.locator('canvas.sig-page').waitFor({ timeout: 30000 });
    const padBox = await page.locator('canvas.sigpad').boundingBox();
    const pageBox = await page.locator('canvas.sig-page').boundingBox();
    if (!padBox || !pageBox) throw new Error('sign: expected a pad canvas and a page canvas');
    await page.mouse.move(padBox.x + 15, padBox.y + 30);
    await page.mouse.down();
    for (let i = 0; i < 14; i++) await page.mouse.move(padBox.x + 15 + i * 8, padBox.y + 30 + Math.sin(i / 1.5) * 14);
    await page.mouse.up();
    await page.locator('canvas.sig-page').click({ position: { x: 300, y: 700 } });
    await page.locator('button.btn', { hasText: 'Export signed' }).click();
    await page.locator('a.fl-name').first().waitFor({ timeout: 40000 });
    const o = await grab(page);
    const d = await load(o[0].bytes);
    check('sign', 'signed PDF keeps all pages', d.getPageCount() === 6, `${d.getPageCount()}`);
    check('sign', 'ink embedded (file grew)', o[0].bytes.length > fs.statSync(f('text.pdf')).size, `${o[0].bytes.length}B vs ${fs.statSync(f('text.pdf')).size}B`);
    check('sign', 'original text stays selectable (signature is an overlay)', (await extractText(o[0].bytes)).includes('BROWSER PROOF'));
  },
  redact: () => async (page) => {
    await page.goto(`${BASE}/redact`, { waitUntil: 'networkidle' });
    await page.locator('input[type=file]').first().setInputFiles([f('text.pdf')]);
    await page.locator('.redact-wrap canvas').first().waitFor({ state: 'attached', timeout: 30000 });
    await page.waitForTimeout(1200);
    await page.mouse.move(0, 0);
    const b = await page.locator('.redact-wrap canvas').first().boundingBox();
    if (!b) throw new Error('redact: page canvas has no box');
    // keep every point inside the canvas, or the pointer drag falls off the element
    const x0 = b.x + b.width * 0.06, y0 = b.y + b.height * 0.07;
    await page.mouse.move(x0, y0);
    await page.mouse.down();
    await page.mouse.move(x0 + b.width * 0.6, y0 + b.height * 0.14, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(400);
    await page.locator('button.btn', { hasText: 'Export redacted' }).click();
    await page.locator('a.fl-name').first().waitFor({ timeout: 40000 });
    let o = await grab(page);
    // the box was drawn on page 1 only, so judge page 1 — the other pages must keep their text
    let pages = await extractPages(o[0].bytes);
    check('redact', 'redacted page loses the text under the box', !/quick brown fox/i.test(pages[0]), JSON.stringify(pages[0].replace(/\s+/g, ' ').trim().slice(0, 60)));
    check('redact', 'untouched pages keep their text', /quick brown fox/i.test(pages[2]), 'page 3 intact');
    check('redact', 'default output is the secure build', /secure/i.test(o[0].name), o[0].name);
    await page.locator('select').nth(1).selectOption('standard');
    await page.locator('button.btn', { hasText: 'Export redacted' }).click();
    await page.waitForTimeout(2000);
    o = await grab(page);
    pages = await extractPages(o[0].bytes);
    check('redact', 'standard mode is honestly overlay-only (text remains, as labelled)', /quick brown fox/i.test(pages[0]), 'recoverable by design');
  },
  compare: () => async (page) => {
    await page.goto(`${BASE}/compare`, { waitUntil: 'networkidle' });
    await page.locator('input[type=file]').first().setInputFiles([f('text.pdf'), f('text-changed.pdf')]);
    await page.locator('button.btn', { hasText: 'Compare' }).click();
    await page.locator('a.fl-name').first().waitFor({ timeout: 60000 });
    const o = await grab(page);
    const txt = o[0].bytes.toString('utf8');
    check('compare', 'report produced', o[0].bytes.length > 20, o[0].name);
    check('compare', 'exactly the one changed page was flagged', /1 page/.test(txt) && /6 pages compared/.test(txt), JSON.stringify(txt.replace(/\s+/g, ' ').slice(0, 110)));
  },
  'fill-form': () => async (page) => {
    await page.goto(`${BASE}/fill-form`, { waitUntil: 'networkidle' });
    await page.locator('input[type=file]').first().setInputFiles([f('form.pdf')]);
    await page.locator('button.btn', { hasText: 'Fill & download' }).waitFor({ timeout: 30000 });
    const fields = page.locator('input[type=text], input:not([type="file"]):not([type="checkbox"]):not([type="radio"]):not([type="password"])');
    const n = await fields.count();
    if (n >= 2) { await fields.nth(0).fill('Ada Lovelace'); await fields.nth(1).fill('London'); }
    await page.locator('button.btn', { hasText: 'Fill & download' }).click();
    await page.locator('a.fl-name').first().waitFor({ timeout: 40000 });
    const o = await grab(page);
    check('fill-form', 'filled PDF produced', isPdf(o[0].bytes), o[0].name);
    check('fill-form', 'form still a form after writing', /\/AcroForm|\/XFA/.test(o[0].bytes.toString('latin1')));
    const t = await extractText(o[0].bytes);
    check('fill-form', 'typed values landed in the PDF', !n || /Ada|London/.test(t), `${n} inputs; ${JSON.stringify(t.replace(/\s+/g, ' ').trim().slice(0, 46))}`);
  },
  'pdf-to-word': () => async (page) => {
    await page.goto(`${BASE}/pdf-to-word`, { waitUntil: 'networkidle' });
    await page.locator('input[type=file]').first().setInputFiles([f('text.pdf')]);
    const btn = page.locator('button.btn', { hasText: 'Convert to Word' });
    await btn.first().waitFor({ timeout: 30000 });
    await btn.first().click();
    await page.locator('a.fl-name').first().waitFor({ timeout: 60000 });
    const o = await grab(page);
    check('pdf-to-word', 'a real .docx came out', isZip(o[0].bytes) && /\.docx$/i.test(o[0].name), o[0].name);
    check('pdf-to-word', 'docx has body', o[0].bytes.length > 1000, `${o[0].bytes.length}B`);
  },
  batch: () => async (page) => {
    await page.goto(`${BASE}/batch`, { waitUntil: 'networkidle' });
    // BatchTool takes a folder and converts the Office documents inside it.
    const DIR = '/tmp/abectorial/batchsrc/';
    fs.rmSync(DIR, { recursive: true, force: true });
    fs.mkdirSync(DIR + '/sub', { recursive: true });
    const seed = OUT + 'text.docx';
    if (!fs.existsSync(seed)) throw new Error('batch: run pdf-to-word first to seed a .docx');
    fs.copyFileSync(seed, DIR + 'a.docx');
    fs.copyFileSync(seed, DIR + '/sub/b.docx');
    fs.writeFileSync(DIR + 'ignore-me.txt', 'not an office file');
    await page.locator('input[type=file][webkitdirectory]').first().setInputFiles(DIR, { recursive: true });
    const btn = page.locator('button.btn').last();
    await btn.waitFor({ timeout: 20000 });
    const label = ((await btn.textContent()) || '').trim();
    await btn.click();
    await page.locator('a.fl-name').first().waitFor({ timeout: 90000 });
    const o = await grab(page);
    check('batch', 'both .docx files converted (subfolders included, .txt skipped)', o.length === 2, `${o.length} outputs (button: ${label.slice(0, 40)})`);
    check('batch', 'outputs are real PDFs', o.every((x) => isPdf(x.bytes)), o.map((x) => x.name).join(','));
  },
};

const only = process.argv.slice(2);
const browser = await chromium.launch();
const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1600 } });
const page = await ctx.newPage();
const jsErrors = [];
page.on('pageerror', (e) => jsErrors.push(String(e.message).split('\n')[0]));
page.on('console', (m) => { if (m.type() === 'error') jsErrors.push('console: ' + m.text().split('\n')[0]); });

const registry = (await import('../lib/tools.js')).TOOLS;
if (!only.length) {
  console.log(`\n=== stage A: all ${registry.length} tool pages load clean ===`);
  for (const t of registry) {
    jsErrors.length = 0;
    let ok = false, note = '';
    try {
      const res = await page.goto(`${BASE}/${t.slug}`, { waitUntil: 'networkidle', timeout: 25000 });
      ok = res.status() === 200;
      note = `http ${res.status()}`;
      if (!(await page.locator('input[type=file], button.btn, [class*=drop]').count())) { ok = false; note = 'no widget mounted'; }
      if (!(await page.locator('h1').first().textContent().catch(() => '') || '').trim()) { ok = false; note += ' / no h1'; }
    } catch (e) { note = e.message.split('\n')[0]; }
    const errs = jsErrors.filter((e) => !/favicon|ResizeObserver/i.test(e));
    check('load', `${t.slug} renders without JS errors`, ok && errs.length === 0, note + (errs.length ? ' | ' + errs[0] : ''));
  }
}

console.log(`\n=== stage B: engines run for real in Chromium ===`);
const slugs = only.length ? only : Object.keys(CASES);
for (const slug of slugs) {
  if (!CASES[slug]) { console.log(`SKIP  [${slug}] no browser case (covered by node parity)`); continue; }
  jsErrors.length = 0;
  try {
    await CASES[slug]()(page);
  } catch (e) {
    fail++; failures.push(`${slug}: ${e.message}`);
    console.log(`FAIL  [${slug}] ${e.message.split('\n')[0]}`);
  }
  if (jsErrors.length) console.log(`      js-console during ${slug}: ${jsErrors.slice(0, 2).join(' | ')}`);
}
await browser.close();

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
if (failures.length) console.log('failures:\n  ' + failures.join('\n  '));
console.log(`downloaded artifacts in ${OUT}`);
process.exit(fail ? 1 : 0);
