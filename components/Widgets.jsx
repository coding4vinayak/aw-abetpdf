'use client';
import { useEffect, useRef, useState } from 'react';
import { buildDocxBlob, docxToParagraphs, docxToRuns } from '../lib/docx.mjs';
import { typesetPdf, typesetSheets } from '../lib/typeset.mjs';
import { xlsxSheets } from '../lib/xlsx.mjs';
import { buildXlsxBytes } from '../lib/xlsxwrite.mjs';
import { extractPageTable } from '../lib/table-extract.mjs';
import { imposeBooklet } from '../lib/booklet.mjs';
import { pptxSlides, slidesPdf } from '../lib/pptx.mjs';
import { PRO, tasteLeft, consumeTaste, proLocked, PRO_ERR } from '../lib/premium';
import { UpgradeNote, TasteMeter } from './Upgrade';
import { PDFDocument, StandardFonts, degrees, rgb, PDFTextField, PDFCheckBox, PDFDropdown, PDFOptionList, PDFRadioGroup } from '@cantoo/pdf-lib';

const fmtB = (n) => n > 1048576 ? `${(n / 1048576).toFixed(2)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
const bufOf = (f) => f.arrayBuffer ? f.arrayBuffer() : f;

async function loadPdf(file) {
  return PDFDocument.load(await bufOf(file), { ignoreEncryption: true });
}
async function savePdf(doc, name) {
  const bytes = await doc.save({ useObjectStreams: true });
  return { name, blob: new Blob([bytes], { type: 'application/pdf' }), size: bytes.length };
}
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
async function pdfJsDoc(file) {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  return pdfjs.getDocument({ data: new Uint8Array(await bufOf(file)) }).promise;
}
async function renderPage(page, scale) {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  return canvas;
}

// tasteLeft() reads localStorage, which the server never has. Seeding state
// after mount keeps the first client render identical to the SSR HTML
// (otherwise React discards the tree) — the documented reason the one
// set-state-in-effect disable in this file lives here, once, instead of on
// every tool that spends taste.
function useTaste() {
  const [taste, setTaste] = useState(PRO.tasteRuns);
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => { setTaste(tasteLeft()); }, []);
  /* eslint-enable react-hooks/set-state-in-effect */
  return [taste, setTaste];
}
function canvasToJpg(canvas, q) {
  return new Promise((res) => canvas.toBlob((b) => res(b), 'image/jpeg', q));
}

function Dropzone({ accept, multiple, files, setFiles }) {
  const input = useRef(null);
  const [over, setOver] = useState(false);
  function add(list) {
    const ok = (f) => !accept || accept.split(',').some((a) =>
      a.startsWith('.') ? f.name.toLowerCase().endsWith(a)
        : a.endsWith('/*') ? f.type.startsWith(a.slice(0, -1))
          : f.type === a || f.type.endsWith('/' + a.split('/')[1]) || /\.(png|jpe?g|webp)$/i.test(a) && /\.(png|jpe?g|webp)$/i.test(f.name));
    const arr = [...(list || [])].filter(ok);
    setFiles(multiple ? [...files, ...arr] : arr.slice(0, 1));
  }
  const move = (i, d) => { const f = [...files]; const [x] = f.splice(i, 1); f.splice(i + d, 0, x); setFiles(f); };
  return (
    <div>
      <div
        className={'dropzone' + (over ? ' over' : '')}
        onClick={() => input.current.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); }}
      >
        <strong>{files.length ? `${files.length} file${files.length > 1 ? 's' : ''} ready` : 'Drop your file(s) here or click to choose'}</strong>
        <span className="dz-note">Nothing is uploaded — processing runs in this tab</span>
        <input ref={input} type="file" hidden accept={accept} multiple={multiple} onChange={(e) => add(e.target.files)} />
      </div>
      {!!files.length && (
        <ul className="file-list">
          {files.map((f, i) => (
            <li key={i}>
              <span className="fl-name">{f.name}</span>
              <span className="fl-size">{fmtB(f.size)}</span>
              {multiple && <button className="mini" onClick={() => move(i, -1)} disabled={i === 0} aria-label="move up">↑</button>}
              {multiple && <button className="mini" onClick={() => move(i, 1)} disabled={i === files.length - 1} aria-label="move down">↓</button>}
              <button className="mini" onClick={() => setFiles(files.filter((_, j) => j !== i))}>✕</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const OPT = { padding: '12px 0 4px', display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' };
function Field({ label, children }) {
  return <label className="opt-field"><span>{label}</span>{children}</label>;
}

function Tool({ tool, run, options }) {
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [outs, setOuts] = useState([]);
  async function go() {
    setErr(''); setOuts([]); setBusy(true);
    try { setOuts(await run(files)); } catch (e) { setErr(e?.message || 'Something went wrong — the file may be corrupted or encrypted.'); }
    setBusy(false);
  }
  return (
    <div className="card">
      <Dropzone accept={tool.accept} multiple={tool.multiple} files={files} setFiles={setFiles} />
      {options}
      <div style={{ marginTop: 14 }}>
        <button className="btn" onClick={go} disabled={(!tool.filesOptional && !files.length) || busy}>{busy ? 'Working in your browser…' : `${tool.emoji} Run ${tool.name} →`}</button>
      </div>
      {err && <p className="error-note">{err}</p>}
      {!!outs.length && (
        <div className="result">
          <h3 className="pass">Done ✓ — {outs.length === 1 ? fmtB(outs[0].size) : `${outs.length} files`} {outs[0].note ? `· ${outs[0].note}` : ''}</h3>
          <ul className="file-list">
            {outs.map((o, i) => (
              <li key={i}>
                <a className="fl-name" href={URL.createObjectURL(o.blob)} download={o.name}>{o.name}</a>
                <span className="fl-size">{fmtB(o.size)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function ToolWidget({ slug }) {
  const T = { accept: 'application/pdf', multiple: false };
  const IMG = { accept: 'image/jpeg,image/png,image/webp', multiple: true };
  const spec = {
    merge: () => ({
      tool: { ...T, emoji: '🟣', name: 'Merge PDF', accept: 'application/pdf', multiple: true },
      run: async (fs) => {
        const out = await PDFDocument.create();
        for (const f of fs) { const d = await loadPdf(f); const pages = await out.copyPages(d, d.getPageIndices()); pages.forEach((p) => out.addPage(p)); }
        return [await savePdf(out, 'abetpdf-merged.pdf')];
      },
    }),
    split: () => {
      let mode = 'range', ranges = '1';
      return {
        tool: { ...T, emoji: '🔵', name: 'Split PDF' },
        options: <OptionsSplit setMode={(m) => (mode = m)} setRanges={(r) => (ranges = r)} />,
        run: async ([f]) => {
          const d = await loadPdf(f);
          if (mode === 'all') {
            const outs = [];
            for (let i = 0; i < d.getPageCount(); i++) {
              const n = await PDFDocument.create();
              (await n.copyPages(d, [i])).forEach((p) => n.addPage(p));
              outs.push(await savePdf(n, `${f.name.replace(/\.pdf$/i, '')}-page-${i + 1}.pdf`));
            }
            return outs;
          }
          const keep = [...parseRanges(ranges, d.getPageCount())].sort((a, b) => a - b);
          if (!keep.length) throw new Error('No valid pages in that range (e.g. 1-3, 5).');
          const n = await PDFDocument.create();
          (await n.copyPages(d, keep)).forEach((p) => n.addPage(p));
          return [await savePdf(n, 'extracted.pdf')];
        },
      };
    },
    compress: () => {
      let mode = 'light';
      return {
        tool: { ...T, emoji: '🟠', name: 'Compress PDF' },
        options: <Field label="Mode"><select defaultValue="light" onChange={(e) => (mode = e.target.value)}><option value="light">Light (lossless)</option><option value="balanced">Balanced (re-render 2×, q60)</option><option value="strong">Strong (re-render 1.5×, q45)</option></select></Field>,
        run: async ([f]) => {
          const orig = f.size;
          let out;
          if (mode === 'light') {
            const d = await loadPdf(f);
            d.setTitle(''); d.setAuthor(''); d.setSubject(''); d.setKeywords([]); d.setProducer('AbetPDF');
            out = await savePdf(d, 'optimized.pdf');
          } else {
            const scale = mode === 'balanced' ? 2 : 1.5;
            const q = mode === 'balanced' ? 0.6 : 0.45;
            const src = await pdfJsDoc(f);
            const n = await PDFDocument.create();
            for (let i = 1; i <= src.numPages; i++) {
              const pg = await src.getPage(i);
              const vp1 = pg.getViewport({ scale: 1 });
              const canvas = await renderPage(pg, scale);
              const jpg = await n.embedJpg(await canvasToJpg(canvas, q).then((b) => b.arrayBuffer()));
              const out = n.addPage([vp1.width, vp1.height]);
              out.drawImage(jpg, { x: 0, y: 0, width: vp1.width, height: vp1.height });
            }
            out = await savePdf(n, 'compressed.pdf');
          }
          out.note = `${fmtB(orig)} → ${fmtB(out.size)} (${Math.max(0, Math.round((1 - out.size / orig) * 100))}% smaller)`;
          return [out];
        },
      };
    },
    'to-images': () => {
      let scale = 2, q = 0.9, fmt = 'jpeg';
      return {
        tool: { ...T, emoji: '🌗', name: 'PDF to JPG/PNG' },
        options: <>
          <Field label="Resolution"><select onChange={(e) => (scale = +e.target.value)} defaultValue="2"><option value="1">72 dpi</option><option value="2">144 dpi</option><option value="3">216 dpi</option><option value="6">432 dpi · PRO</option></select></Field><br /><span className="dz-note" style={{fontSize:11}}>432 dpi is an AbetPDF Pro engine — 3 free tries.</span>
          <Field label="Format"><select onChange={(e) => (fmt = e.target.value)} defaultValue="jpeg"><option value="jpeg">JPG (smaller)</option><option value="png">PNG (sharper)</option></select></Field>
          <Field label="JPG quality"><select onChange={(e) => (q = +e.target.value)} defaultValue="0.9"><option value="0.95">High</option><option value="0.85">Medium</option><option value="0.7">Small</option></select></Field>
        </>,
        run: async ([f]) => {
          if (scale >= 4) { if (proLocked()) throw new Error(PRO_ERR); consumeTaste(); }
          const src = await pdfJsDoc(f);
          const outs = [];
          for (let i = 1; i <= src.numPages; i++) {
            const canvas = await renderPage(await src.getPage(i), scale);
            const blob = fmt === 'png'
              ? await new Promise((res) => canvas.toBlob(res, 'image/png'))
              : await canvasToJpg(canvas, q);
            outs.push({ name: `${f.name.replace(/\.pdf$/i, '')}-page-${i}.${fmt === 'png' ? 'png' : 'jpg'}`, blob, size: blob.size });
          }
          return outs;
        },
      };
    },
    'from-images': () => {
      let fit = 'image';
      return {
        tool: { ...IMG, emoji: '🖼️', name: 'JPG to PDF' },
        options: <Field label="Page size"><select onChange={(e) => (fit = e.target.value)} defaultValue="image"><option value="image">Match image</option><option value="a4">A4 (fit)</option><option value="letter">US Letter (fit)</option></select></Field>,
        run: async (fs) => {
          const n = await PDFDocument.create();
          for (const f of fs) {
            let bytes = await bufOf(f), isPng = /png$/i.test(f.type);
            if (f.type === 'image/webp' || f.type === 'image/heic' || (!isPng && !/jpeg$/i.test(f.type))) {
              const bmp = await createImageBitmap(f);
              const c = document.createElement('canvas');
              c.width = bmp.width; c.height = bmp.height;
              c.getContext('2d').drawImage(bmp, 0, 0);
              bytes = await canvasToJpg(c, 0.92).then((b) => b.arrayBuffer());
              isPng = false;
            }
            const img = isPng ? await n.embedPng(bytes) : await n.embedJpg(bytes);
            if (fit === 'image') {
              const page = n.addPage([img.width * 0.75, img.height * 0.75]);
              page.drawImage(img, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
            } else {
              const [pw, ph] = fit === 'a4' ? [595.28, 841.89] : [612, 792];
              const page = n.addPage([pw, ph]);
              const s = Math.min((pw - 36) / img.width, (ph - 36) / img.height);
              const w = img.width * s, h = img.height * s;
              page.drawImage(img, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
            }
          }
          return [await savePdf(n, 'images.pdf')];
        },
      };
    },
    rotate: () => {
      let dir = 90, ranges = '';
      return {
        tool: { ...T, emoji: '🔄', name: 'Rotate PDF' },
        options: <>
          <Field label="Direction"><select onChange={(e) => (dir = +e.target.value)}><option value="90">90° clockwise</option><option value="-90">90° counter-clockwise</option><option value="180">180°</option></select></Field>
          <Field label="Pages (blank = all)"><input defaultValue="" onChange={(e) => (ranges = e.target.value)} placeholder="e.g. 2-4, 7" /></Field>
        </>,
        run: async ([f]) => {
          const d = await loadPdf(f);
          const set = ranges.trim() ? parseRanges(ranges, d.getPageCount()) : new Set(d.getPageIndices());
          set.forEach((i) => { const p = d.getPage(i); p.setRotation(degrees(((p.getRotation().angle + dir) % 360 + 360) % 360)); });
          return [await savePdf(d, 'rotated.pdf')];
        },
      };
    },
    'delete-pages': () => {
      let ranges = '';
      return {
        tool: { ...T, emoji: '🗑️', name: 'Delete PDF Pages' },
        options: <Field label="Pages to remove"><input onChange={(e) => (ranges = e.target.value)} placeholder="e.g. 1, 4-5" /></Field>,
        run: async ([f]) => {
          const d = await loadPdf(f);
          const del = parseRanges(ranges, d.getPageCount());
          if (!del.size) throw new Error('Enter which pages to remove, e.g. 1, 4-5.');
          const keep = d.getPageIndices().filter((i) => !del.has(i));
          const n = await PDFDocument.create();
          (await n.copyPages(d, keep)).forEach((p) => n.addPage(p));
          return [await savePdf(n, 'trimmed.pdf')];
        },
      };
    },
    watermark: () => {
      let text = 'DRAFT', size = 48, opacity = 0.18, angle = 45;
      return {
        tool: { ...T, emoji: '💧', name: 'Watermark PDF' },
        options: <>
          <Field label="Text"><input defaultValue="DRAFT" onChange={(e) => (text = e.target.value || 'DRAFT')} /></Field>
          <Field label="Size"><input type="number" defaultValue={48} onChange={(e) => (size = +e.target.value || 48)} style={{ width: 70 }} /></Field>
          <Field label="Opacity"><input type="number" step="0.05" min="0.05" max="1" defaultValue={0.18} onChange={(e) => (opacity = +e.target.value)} style={{ width: 80 }} /></Field>
          <Field label="Angle"><select onChange={(e) => (angle = +e.target.value)} defaultValue="45"><option value="0">Flat</option><option value="45">Diagonal ↗</option><option value="-45">Diagonal ↘</option></select></Field>
        </>,
        run: async ([f]) => {
          const d = await loadPdf(f);
          const font = await d.embedFont(StandardFonts.HelveticaBold);
          for (const i of d.getPageIndices()) {
            const p = d.getPage(i);
            const w = text.length * size * 0.55;
            p.drawText(text, { x: (p.getWidth() - w) / 2, y: (p.getHeight() - size) / 2, size, font, opacity, color: rgb(0.4, 0.25, 0.9), rotate: degrees(angle) });
          }
          return [await savePdf(d, 'watermarked.pdf')];
        },
      };
    },
    'page-numbers': () => {
      let fmt = '{n}', pos = 'bc', start = 1, size = 11;
      return {
        tool: { ...T, emoji: '🔢', name: 'Page Numbers' },
        options: <>
          <Field label="Format"><input defaultValue="{n}" onChange={(e) => (fmt = e.target.value || '{n}')} placeholder="Page {n} of {t}" /></Field>
          <Field label="Position"><select onChange={(e) => (pos = e.target.value)} defaultValue="bc"><option value="bc">Bottom center</option><option value="br">Bottom right</option><option value="bl">Bottom left</option><option value="tr">Top right</option></select></Field>
          <Field label="Start from page"><input type="number" min="1" defaultValue={1} onChange={(e) => (start = +e.target.value || 1)} style={{ width: 70 }} /></Field>
        </>,
        run: async ([f]) => {
          const d = await loadPdf(f);
          const font = await d.embedFont(StandardFonts.Helvetica);
          const total = d.getPageCount();
          for (const i of d.getPageIndices()) {
            if (i + 1 < start) continue;
            const p = d.getPage(i);
            const label = fmt.replace('{n}', String(i + 1)).replace('{t}', String(total));
            const w = font.widthOfTextAtSize(label, size);
            const x = pos.endsWith('c') ? (p.getWidth() - w) / 2 : pos.endsWith('r') ? p.getWidth() - w - 24 : 24;
            const y = pos.startsWith('t') ? p.getHeight() - 20 : 12;
            p.drawText(label, { x, y, size, font, color: rgb(0.25, 0.25, 0.3) });
          }
          return [await savePdf(d, 'numbered.pdf')];
        },
      };
    },
    'to-text': () => ({
      tool: { ...T, emoji: '📝', name: 'PDF to Text' },
      run: async ([f]) => {
        const src = await pdfJsDoc(f);
        const pages = [];
        for (let i = 1; i <= src.numPages; i++) {
          const tc = await (await src.getPage(i)).getTextContent();
          let text = '', lastY = null;
          for (const it of tc.items) {
            if (!('str' in it)) continue;
            const y = it.transform[5];
            if (lastY !== null && Math.abs(y - lastY) > 2) text += y < lastY ? '\n' : '\n';
            else if (text && !text.endsWith(' ') && !text.endsWith('\n')) text += ' ';
            text += it.str;
            lastY = y;
          }
          pages.push(`—— page ${i} ——\n${text.trim()}`);
        }
        const blob = new Blob([pages.join('\n\n') + '\n'], { type: 'text/plain' });
        return [{ name: f.name.replace(/\.pdf$/i, '') + '.txt', blob, size: blob.size }];
      },
    }),
    protect: () => {
      let up = '', noPrint = false, noCopy = false, noMod = false;
      return {
        tool: { ...T, emoji: '🔒', name: 'Protect PDF' },
        options: <>
          <Field label="Open password"><input type="password" onChange={(e) => (up = e.target.value)} /></Field>
          <Field label="Permissions"><span style={{ display: 'inline-flex', gap: 12, fontSize: 13, color: 'var(--ink-2)' }}>
            <label><input type="checkbox" onChange={(e) => (noPrint = e.target.checked)} /> block printing</label>
            <label><input type="checkbox" onChange={(e) => (noCopy = e.target.checked)} /> block copying</label>
            <label><input type="checkbox" onChange={(e) => (noMod = e.target.checked)} /> block modifying</label>
          </span></Field>
        </>,
        run: async ([f]) => {
          if (up.length < 4) throw new Error('Pick a password of at least 4 characters.');
          const d = await PDFDocument.load(await bufOf(f), { ignoreEncryption: true });
          // PDFDocument.save() ignores password options entirely — encryption only
          // happens through encrypt(), which installs the security handler.
          d.encrypt({
            userPassword: up,
            ownerPassword: up + '-owner',
            algorithm: 'AES-256',
            permissions: { printing: !noPrint, copying: !noCopy, modifying: !noMod, annotating: !noMod, fillingForms: !noMod, contentAccessibility: !noCopy },
          });
          const bytes = await d.save({ useObjectStreams: false });
          return [{ name: 'protected.pdf', blob: new Blob([bytes], { type: 'application/pdf' }), size: bytes.length, note: `locked with AES-256 · ${d.getPageCount()} pages` }];
        },
      };
    },
    unlock: () => {
      let pw = '';
      return {
        tool: { ...T, emoji: '🔓', name: 'Unlock PDF' },
        options: <Field label="Current password"><input type="password" onChange={(e) => (pw = e.target.value)} /></Field>,
        run: async ([f]) => {
          const raw = await bufOf(f);
          // pdf-lib accepts any (or no) password and decrypts to garbage, so the password
          // must be confirmed by pdf.js, whose WebCrypto path actually enforces it.
          const pdfjs = await import('pdfjs-dist');
          pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
          const task = pdfjs.getDocument({ data: new Uint8Array(raw).slice(), password: pw || undefined });
          try {
            await task.promise;
          } catch (e) {
            if (e?.name === 'PasswordException') {
              throw new Error(e.code === pdfjs.PasswordResponses.INCORRECT_PASSWORD
                ? 'That password is incorrect — check it and try again.'
                : 'This PDF is password-locked — enter its open password first.');
            }
            throw new Error('Could not open it — the file may be corrupted.');
          } finally {
            task.destroy?.();
          }
          const d = await PDFDocument.load(raw, { password: pw || undefined, ignoreEncryption: true });
          if (!d.getPageCount()) throw new Error('That PDF has no pages to unlock.');
          const out = await savePdf(d, 'unlocked.pdf');
          out.note = `password removed · ${d.getPageCount()} pages`;
          return [out];
        },
      };
    },
    repair: () => ({
      tool: { ...T, emoji: '🩹', name: 'Repair PDF' },
      run: async ([f]) => {
        const d = await PDFDocument.load(await bufOf(f), { ignoreEncryption: true, updateMetadata: false });
        const n = await PDFDocument.create();
        (await n.copyPages(d, d.getPageIndices())).forEach((p) => n.addPage(p));
        const out = await savePdf(n, 'repaired.pdf');
        out.note = `${d.getPageCount()} pages rebuilt`;
        return [out];
      },
    }),
    organize: () => ({ tool: { ...T, emoji: '🗂️', name: 'Organize PDF' }, organizer: true }),
    sign: () => ({ tool: { ...T, emoji: '✍️', name: 'Sign PDF' }, signer: true }),
    crop: () => {
      let mT = 36, mB = 36, mL = 36, mR = 36;
      const num = (set, def) => <input type="number" defaultValue={def} style={{ width: 64 }} onChange={(e) => set(+e.target.value || 0)} />;
      return {
        tool: { ...T, emoji: '✂️', name: 'Crop PDF' },
        options: <>
          <Field label="Top (pt)">{num((v) => (mT = v), 36)}</Field>
          <Field label="Bottom">{num((v) => (mB = v), 36)}</Field>
          <Field label="Left">{num((v) => (mL = v), 36)}</Field>
          <Field label="Right">{num((v) => (mR = v), 36)}</Field>
        </>,
        run: async ([f]) => {
          const d = await PDFDocument.load(await bufOf(f), { ignoreEncryption: true });
          for (const i of d.getPageIndices()) {
            const p = d.getPage(i);
            const { x, y, width, height } = p.getCropBox?.() ?? { x: 0, y: 0, width: p.getWidth(), height: p.getHeight() };
            const nx = x + mL, ny = y + mB, nw = width - mL - mR, nh = height - mT - mB;
            if (nw < 20 || nh < 20) throw new Error('Margins would crop the page away — reduce them.');
            p.setCropBox(nx, ny, nw, nh);
          }
          return [await savePdf(d, 'cropped.pdf')];
        },
      };
    },
    'extract-images': () => {
      let all = false;
      return {
        tool: { ...T, emoji: '🖼️', name: 'Extract Images' },
        options: <Field label="Tiny images"><label style={{ fontSize: 13 }}><input type="checkbox" onChange={(e) => (all = e.target.checked)} /> include all — skip only tiny ones (under 5KB)</label></Field>,
        run: async ([f]) => {
          const pdfjs = await import('pdfjs-dist');
          pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
          const OPS = pdfjs.OPS || { paintImageXObject: 85 };
          const isImageOp = (fn) => fn === OPS.paintImageXObject || fn === OPS.paintXObject;
          const src = await pdfjs.getDocument({ data: new Uint8Array(await bufOf(f)) }).promise;
          const outs = [], seen = new Set();
          for (let i = 1; i <= src.numPages; i++) {
            const page = await src.getPage(i);
            let ops; try { ops = await page.getOperatorList(); } catch { continue; }

            // pdf.js hands image bitmaps to the main thread only while a page is being
            // rendered, and objs.get() throws for anything not resolved yet — so render
            // once at a small scale and read through the callback form.
            try { await renderPage(page, 0.5); } catch { /* best-effort: rendering is what resolves the bitmaps */ }
            const readImage = (id) => new Promise((res) => {
              let settled = false;
              const done = (v) => { if (!settled) { settled = true; res(v); } };
              try { if (page.objs.has(id)) done(page.objs.get(id)); else page.objs.get(id, done); } catch { done(undefined); }
              setTimeout(() => done(undefined), 5000);
            });
            for (let j = 0; j < ops.fnArray.length; j++) {
              const fn = ops.fnArray[j];
              if (!isImageOp(fn)) continue;
              const name = ops.argsArray[j]?.[0];
              if (!name || seen.has(i + ':' + name)) continue;
              seen.add(i + ':' + name);
              try {
                const im = await readImage(name);
                if (!im) continue;
                const c = document.createElement('canvas');
                if (im.bitmap) { c.width = im.bitmap.width; c.height = im.bitmap.height; c.getContext('2d').drawImage(im.bitmap, 0, 0); }
                else if (im.width && im.data) { c.width = im.width; c.height = im.height; c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(im.data), im.width, im.height), 0, 0); }
                else continue;
                const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
                if (!blob) continue;
                if (!all && blob.size < 5120) continue;
                outs.push({ name: `page-${i}-img-${outs.length + 1}.png`, blob, size: blob.size });
              } catch { /* skip unresolvable image objects */ }
            }
          }
          if (!outs.length) throw new Error(all ? 'No embedded images found — this PDF may be pure text.' : 'Only tiny images found (under 5KB) — tick “include all” to extract them anyway.');
          return outs;
        },
      };
    },
    'txt-to-pdf': () => {
      let size = 11, mono = false, pasted = '';
      const textRef = { current: '' };
      return {
        tool: { accept: '.txt,text/plain', multiple: false, filesOptional: true, emoji: '📄', name: 'TXT to PDF' },
        options: <>
          <Field label="Or paste text"><textarea rows={5} style={{ width: 'min(480px,100%)', fontSize: 13, padding: 8, borderRadius: 9, border: '1px solid var(--line)' }} onChange={(e) => { pasted = e.target.value; }} placeholder="Paste your text here… (or drop a .txt above — file wins if both)" /></Field>
          <Field label="Size (pt)"><input type="number" value={size} min={8} max={16} onChange={(e) => { size = +e.target.value || 11; textRef.current = ''; }} style={{ width: 64 }} /></Field>
          <label style={{ fontSize: 13 }}><input type="checkbox" onChange={(e) => (mono = e.target.checked)} /> monospace</label>
        </>,
        run: async ([f]) => {
          const raw = f ? new TextDecoder().decode(await bufOf(f)) : pasted;
          if (!raw || !raw.trim()) throw new Error('Drop a .txt or paste some text first.');
          const d = await typesetPdf(raw, { size, mono });
          return [await savePdf(d, (f ? f.name : 'pasted').replace(/\.[a-z]+$/i, '') + '.pdf')];
        },
      };
    },
    'insert-pages': () => {
      let after = 1;
      return {
        tool: { accept: 'application/pdf', multiple: true, emoji: '📑', name: 'Insert Pages' },
        options: <Field label="Insert 2nd file after page # of 1st file"><input type="number" min={0} defaultValue={1} onChange={(e) => (after = +e.target.value || 0)} style={{ width: 80 }} /></Field>,
        run: async (fs) => {
          if (fs.length !== 2) throw new Error('Drop exactly two PDFs: base first, then the one to insert.');
          const a = await loadPdf(fs[0]), b = await loadPdf(fs[1]);
          const out = await PDFDocument.create();
          const n = Math.max(0, Math.min(after, a.getPageCount()));
          const first = await out.copyPages(a, a.getPageIndices().slice(0, n));
          first.forEach((p) => out.addPage(p));
          (await out.copyPages(b, b.getPageIndices())).forEach((p) => out.addPage(p));
          const rest = await out.copyPages(a, a.getPageIndices().slice(n));
          rest.forEach((p) => out.addPage(p));
          return [await savePdf(out, 'inserted.pdf')];
        },
      };
    },
    redact: () => ({ tool: { ...T, emoji: '⬛', name: 'Redact PDF' }, redactor: true }),
    ocr: () => ({ tool: { ...T, emoji: '🔍', name: 'OCR PDF' }, ocrer: true }),
    'fill-form': () => ({ tool: { ...T, emoji: '🗒️', name: 'Fill PDF Form' }, formfiller: true }),
    compare: () => ({ tool: { ...T, emoji: '⚖️', name: 'Compare PDFs' }, comparer: true }),
    'pdf-to-word': () => ({ tool: { ...T, emoji: '📃', name: 'PDF to Word' }, worder: true }),
    'xls-to-pdf': () => ({
      tool: { ...T, emoji: '🟢', name: 'Excel to PDF' },
      run: async ([f]) => {
        const sheets = await xlsxSheets(await bufOf(f));
        const totalRows = sheets.reduce((a, x) => a + x.rows.length, 0);
        if (!sheets.length || !totalRows) throw new Error('No data found — save the file as .xlsx (Excel workbook) and retry.');
        const d = await typesetSheets(sheets);
        const out = await savePdf(d, f.name.replace(/\.xlsx$/i, '') + '.pdf');
        out.note = `${sheets.length} sheet${sheets.length === 1 ? '' : 's'} · ${totalRows} rows`;
        return [out];
      },
    }),
    'ppt-to-pdf': () => ({
      tool: { ...T, emoji: '🟧', name: 'PowerPoint to PDF' },
      run: async ([f]) => {
        const slides = await pptxSlides(await bufOf(f));
        if (!slides.length) throw new Error('No slides found — save the file as .pptx and retry.');
        if (!slides.some((x) => x.title || x.lines.length)) throw new Error('Those slides contain no text — image-only decks cannot be converted this way.');
        const d = await slidesPdf(slides);
        const out = await savePdf(d, f.name.replace(/\.pptx$/i, '') + '.pdf');
        out.note = `${slides.length} slides · 16:9 landscape`;
        return [out];
      },
    }),
    'pdf-to-pptx': () => ({
      tool: { ...T, emoji: '🟠', name: 'PDF to PowerPoint' },
      run: async ([f]) => {
        const src = await pdfJsDoc(f);
        const PptxGen = (await import('pptxgenjs')).default;
        const p = new PptxGen();
        p.defineLayout({ name: 'ABET169', width: 10, height: 5.63 });
        p.layout = 'ABET169';
        p.title = f.name.replace(/\.pdf$/i, '');
        let slides = 0, bullets = 0;
        for (let i = 1; i <= src.numPages; i++) {
          const lines = await pageLines(await src.getPage(i));
          if (!lines.length) { p.addSlide().addText('—', { x: 0.6, y: 2.4, w: 8.8, fontSize: 14, color: '9AA3B2' }); slides++; continue; }
          const title = lines[0].length > 90 ? lines[0].slice(0, 87) + '…' : lines[0];
          const body = lines.slice(1);
          const chunks = [];
          for (let j = 0; j < body.length; j += 12) chunks.push(body.slice(j, j + 12));
          if (!body.length) chunks.push([]);
          chunks.forEach((ch, ci) => {
            const s = p.addSlide();
            slides++;
            s.addText(ci ? `${title} (cont.)` : title, { x: 0.5, y: 0.3, w: 9, fontSize: ci ? 20 : 24, bold: true, color: '1F2A37' });
            s.addShape(p.ShapeType.rect, { x: 0.5, y: ci ? 1.02 : 1.12, w: 1.6, h: 0.05, fill: { color: 'E8590C' } });
            if (ch.length) {
              bullets += ch.length;
              s.addText(ch.map((t) => ({ text: t, options: { bullet: { indent: 10 }, breakLine: true } })),
                { x: 0.6, y: 1.35, w: 8.9, h: 4.0, fontSize: ch.length > 8 ? 12 : 15, color: '3B4451', valign: 'top', lineSpacingMultiple: 1.15 });
            }
          });
          if (i % 5 === 0) await new Promise((r) => setTimeout(r));
        }
        if (!bullets && slides && src.numPages) {
          const any = await pageLines(await src.getPage(1));
          if (!any.length) throw new Error('No text layer found — this looks like a scan. Run OCR on it first, then convert.');
        }
        const blob = await p.write({ outputType: 'blob' });
        return [{ name: f.name.replace(/\.pdf$/i, '') + '.pptx', blob, size: blob.size, note: `${src.numPages} pages → ${slides} slides` }];
      },
    }),
    'pdf-to-excel': () => ({
      tool: { ...T, emoji: '🧾', name: 'PDF to Excel' },
      run: async ([f]) => {
        const src = await pdfJsDoc(f);
        const sheets = [];
        for (let i = 1; i <= src.numPages; i++) {
          const page = await src.getPage(i);
          const vp = page.getViewport({ scale: 1 });
          const tc = await page.getTextContent();
          const { rows, tabular } = extractPageTable(tc.items.filter((it) => typeof it.str === 'string'), vp.height);
          if (rows.some((r) => r.some((c) => c))) sheets.push({ name: `Page ${i}`, rows });
          if (i % 5 === 0) await new Promise((r) => setTimeout(r));
        }
        if (!sheets.length) throw new Error('No text layer found — this looks like a scan. Run OCR on it first, then convert.');
        const cells = sheets.reduce((a, s) => a + s.rows.reduce((x, r) => x + r.filter(Boolean).length, 0), 0);
        const tablePages = sheets.filter((s) => s.rows.length && s.rows[0].length > 1).length;
        const blob = await buildXlsxBytes(sheets);
        const out = { name: f.name.replace(/\.pdf$/i, '') + '.xlsx', blob, size: blob.size, note: `${sheets.length} sheet${sheets.length === 1 ? '' : 's'} · ${cells} cells${tablePages ? ` · ${tablePages} table page${tablePages === 1 ? '' : 's'}` : ''}` };
        return [out];
      },
    }),
    booklet: () => {
      let gap = 0;
      return {
      tool: { ...T, emoji: '📔', name: 'Booklet / 2-up PDF' },
      options: <Field label="Margin between pages"><select onChange={(e) => (gap = +e.target.value)} defaultValue="0"><option value="0">None (edge to edge)</option><option value="24">Small gap</option><option value="48">Gutter for binding</option></select></Field>,
      run: async ([f]) => {
        const src = await loadPdf(f);
        const pages = src.getPages();
        if (!pages.length) throw new Error('That PDF has no pages.');
        const sizes = pages.map((p) => p.getSize());
        const pad = Math.ceil(pages.length / 4) * 4;
        const out = await PDFDocument.create();
        out.setTitle(f.name.replace(/\.pdf$/i, '') + ' — booklet');
        const embedded = await out.embedPdf(await bufOf(f), pages.map((_, i) => i));
        const w = sizes.reduce((a, s) => Math.max(a, s.width), 0);
        const h = sizes.reduce((a, s) => Math.max(a, s.height), 0);
        const padded = [...sizes]; while (padded.length < pad) padded.push({ width: w, height: h });
        const sheets = imposeBooklet(padded);
        sheets.forEach((sheet, si) => {
          const pg = out.addPage([sheet.width + gap, sheet.height]);
          sheet.pages.forEach((idx, pos) => {
            if (idx >= pages.length) return;
            const ref = embedded[idx];
            const s = src.getPages()[idx].getSize();
            const scale = Math.min(sheet.height / s.height, 1);
            pg.drawPage(ref, { x: pos * (w + gap) + (w - s.width * scale) / 2, y: (sheet.height - s.height * scale) / 2, width: s.width * scale, height: s.height * scale });
          });
        });
        const res = await savePdf(out, f.name.replace(/\.pdf$/i, '') + '-booklet.pdf');
        res.note = `${pages.length} pages → ${sheets.length / 2} duplex sheets · print 2-sided, flip long edge, staple`;
        return [res];
      },
      };
    },
    'select-pages': () => {
      let ranges = '', perPage = false, reverse = false;
      return {
      tool: { ...T, emoji: '✂️', name: 'Select Pages' },
      options: <>
        <Field label="Pages to keep"><input placeholder="e.g. 1-3, 5, 8-" onChange={(e) => (ranges = e.target.value)} /></Field>
        <div style={OPT}>
          <label style={{ fontSize: 13 }}><input type="checkbox" onChange={(e) => (perPage = e.target.checked)} /> One PDF per page</label>
          <label style={{ fontSize: 13 }}><input type="checkbox" onChange={(e) => (reverse = e.target.checked)} /> Reverse order</label>
        </div>
      </>,
      run: async ([f]) => {
        const d = await loadPdf(f);
        const total = d.getPageCount();
        let keep = ranges.trim() ? [...parseRanges(ranges, total)] : [...Array(total).keys()];
        if (!keep.length) throw new Error('That selection keeps zero pages — check the ranges (e.g. 1-3, 5).');
        if (reverse) keep = keep.slice().reverse();
        if (perPage) {
          const outs = [];
          for (const idx of keep) {
            const n = await PDFDocument.create();
            (await n.copyPages(d, [idx])).forEach((p) => n.addPage(p));
            const out = await savePdf(n, `page-${idx + 1}.pdf`);
            outs.push(out);
            if (outs.length % 5 === 0) await new Promise((r) => setTimeout(r));
          }
          return outs;
        }
        const n = await PDFDocument.create();
        (await n.copyPages(d, keep)).forEach((p) => n.addPage(p));
        const res = await savePdf(n, f.name.replace(/\.pdf$/i, '') + '-selected.pdf');
        res.note = `${keep.length} of ${total} pages${reverse ? ' · reversed' : ''}`;
        return [res];
      },
      };
    },
    'add-margins': () => {
      let margin = '28';
      return {
      tool: { ...T, emoji: '⬜', name: 'Add Margins' },
      options: <Field label="Margin"><select onChange={(e) => (margin = e.target.value)} defaultValue="28"><option value="14">0.5 cm (14 pt)</option><option value="28">1 cm (28 pt)</option><option value="57">2 cm (57 pt)</option><option value="85">3 cm (85 pt)</option><option value="113">4 cm (113 pt)</option></select></Field>,
      run: async ([f]) => {
        const m = +margin;
        if (!m) throw new Error('Pick a margin size first.');
        const src = await loadPdf(f);
        const bytes = await src.save();
        const out = await PDFDocument.create();
        const embedded = await out.embedPdf(bytes, src.getPageIndices());
        const pages = src.getPages();
        embedded.forEach((ref, i) => {
          const { width, height } = pages[i].getSize();
          const pg = out.addPage([width + 2 * m, height + 2 * m]);
          pg.drawPage(ref, { x: m, y: m, width, height });
        });
        const res = await savePdf(out, f.name.replace(/\.pdf$/i, '') + `-margins.pdf`);
        res.note = `${pages.length} pages framed with ${m} pt margins · text stays selectable`;
        return [res];
      },
      };
    },
    batch: () => ({ tool: { ...T, emoji: '📦', name: 'Batch Convert' }, batcher: true }),
    'docx-to-pdf': () => {
      let fmt = false;
      return {
      tool: { ...T, emoji: '🔵', name: 'Word to PDF' },
      options: <div className="opt-field"><label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}><input type="checkbox" onChange={(e) => (fmt = e.target.checked)} /> Keep bold &amp; italics <span className="pro-badge">PRO</span></label></div>,
      run: async ([f]) => {
        if (fmt) { if (proLocked()) throw new Error(PRO_ERR); consumeTaste(); }
        const name = f.name.replace(/\.docx$/i, '') + '.pdf';
        if (fmt) {
          const runs = await docxToRuns(await bufOf(f));
          if (!runs.some((r) => r && r.length)) throw new Error('No text found in that .docx — is it a real Word file?');
          const d = await typesetPdf(runs, { size: 11 });
          const out = await savePdf(d, name);
          out.note = `${runs.filter((r) => r && r.length).length} paragraphs, styling preserved (Pro)`;
          return [out];
        }
        const paras = await docxToParagraphs(await bufOf(f));
        if (!paras.some((x) => x)) throw new Error('No text found in that .docx — is it a real Word file?');
        const d = await typesetPdf(paras.join('\n'), { size: 11 });
        const out = await savePdf(d, name);
        out.note = `${paras.filter((x) => x).length} paragraphs typeset`;
        return [out];
      },
      };
    },
    flatten: () => {
      let pro = false;
      return {
      tool: { ...T, emoji: '🧷', name: 'Flatten PDF' },
      options: <div className="opt-field"><label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}><input type="checkbox" onChange={(e) => (pro = e.target.checked)} /> 300 dpi print quality <span className="pro-badge">PRO</span></label></div>,
      run: async ([f]) => {
        const scale = pro ? 3 : 2, q = pro ? 0.92 : 0.85;
        if (pro) { if (proLocked()) throw new Error(PRO_ERR); consumeTaste(); }
        const src = await pdfJsDoc(f);
        const n = await PDFDocument.create();
        for (let i = 1; i <= src.numPages; i++) {
          const pg = await src.getPage(i);
          const vp1 = pg.getViewport({ scale: 1 });
          const canvas = await renderPage(pg, scale);
          const jpg = await n.embedJpg(await canvasToJpg(canvas, q).then((b) => b.arrayBuffer()));
          const out = n.addPage([vp1.width, vp1.height]);
          out.drawImage(jpg, { x: 0, y: 0, width: vp1.width, height: vp1.height });
          if (i % 5 === 0) await new Promise((r) => setTimeout(r));
        }
        const res = await savePdf(n, 'flattened.pdf');
        res.note = `${src.numPages} pages frozen at ${pro ? '300' : '200'} dpi`;
        return [res];
      },
      };
    },
    metadata: () => {
      let v = { title: '', author: '', subject: '', keywords: '', creator: '', scrub: false };
      const inp = (k, ph, type) => <Field label={ph}><input type={type || 'text'} placeholder={ph} onChange={(e) => (v[k] = e.target.value)} /></Field>;
      return {
        tool: { ...T, emoji: '🏷️', name: 'Edit PDF Metadata' },
        options: <>
          {inp('title', 'Title')}
          {inp('author', 'Author')}
          {inp('subject', 'Subject')}
          {inp('keywords', 'Keywords (comma, separated)')}
          {inp('creator', 'Creator')}
          <div className="opt-field" style={{ marginBottom: 10 }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
              <input type="checkbox" onChange={(e) => (v.scrub = e.target.checked)} /> Scrub all hidden info instead
            </label>
          </div>
        </>,
        run: async ([f]) => {
          const d = await loadPdf(f);
          if (v.scrub) {
            d.setTitle(''); d.setAuthor(''); d.setSubject(''); d.setKeywords([]); d.setCreator(''); d.setProducer('AbetPDF');
            const o = await savePdf(d, 'scrubbed.pdf');
            o.note = 'hidden info wiped';
            return [o];
          }
          let set = 0;
          if (v.title) { d.setTitle(v.title); set++; }
          if (v.author) { d.setAuthor(v.author); set++; }
          if (v.subject) { d.setSubject(v.subject); set++; }
          if (v.creator) { d.setCreator(v.creator); set++; }
          if (v.keywords) { d.setKeywords(v.keywords.split(',').map((s) => s.trim()).filter(Boolean)); set++; }
          if (!set) throw new Error('Fill at least one field, or tick “Scrub all”.');
          const o = await savePdf(d, 'retagged.pdf');
          o.note = `${set} propert${set === 1 ? 'y' : 'ies'} updated`;
          return [o];
        },
      };
    },
  };
  const inst = (spec[slug] || (() => ({})))();
  if (!inst.tool) return null;
  if (inst.organizer) return <Organizer tool={inst.tool} />;
  if (inst.signer) return <SignTool tool={inst.tool} />;
  if (inst.redactor) return <Redactor tool={inst.tool} />;
  if (inst.ocrer) return <OcrTool tool={inst.tool} />;
  if (inst.formfiller) return <FormFiller tool={inst.tool} />;
  if (inst.comparer) return <CompareTool tool={inst.tool} />;
  if (inst.worder) return <WordExport tool={inst.tool} />;
  if (inst.batcher) return <BatchTool tool={inst.tool} />;
  return (
    <>
      <Tool tool={inst.tool} run={inst.run} options={inst.options} />
    </>
  );
}

function OptionsSplit({ setMode, setRanges }) {
  const [m, setM] = useState('range');
  const upd = (v) => { setM(v); setMode(v); };
  return (
    <div style={OPT}>
      <Field label="Mode"><select value={m} onChange={(e) => upd(e.target.value)}><option value="range">Extract a range</option><option value="all">Split every page</option></select></Field>
      {m === 'range' && <Field label="Pages"><input defaultValue="1" onChange={(e) => setRanges(e.target.value)} placeholder="e.g. 1-3, 5, 8-10" /></Field>}
    </div>
  );
}

function Organizer({ tool }) {
  const [files, setFiles] = useState([]);
  const [pages, setPages] = useState(null);
  const [thumbs, setThumbs] = useState({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [outs, setOuts] = useState([]);
  const raw = useRef(null);

  async function load(fs) {
    if (!fs.length) return;
    setErr(''); setPages(null); setThumbs({});
    const buf = await fs[0].arrayBuffer();
    raw.current = buf;
    try {
      const src = await pdfJsDoc(fs[0]);
      setPages(Array.from({ length: src.numPages }, (_, i) => ({ idx: i, rot: 0 })));
      for (let i = 1; i <= src.numPages; i++) {
        const canvas = await renderPage(await src.getPage(i), 0.5);
        setThumbs((t) => ({ ...t, [i - 1]: canvas.toDataURL('image/jpeg', 0.7) }));
      }
    } catch (e) { setErr('Could not read this PDF — try Repair first.'); }
  }

  function move(i, d) { const p = [...pages]; const [x] = p.splice(i, 1); p.splice(i + d, 0, x); setPages(p); }
  function rot(i) { const p = [...pages]; p[i] = { ...p[i], rot: (p[i].rot + 90) % 360 }; setPages(p); }
  function del(i) { setPages(pages.filter((_, j) => j !== i)); }

  async function go() {
    setBusy(true); setErr(''); setOuts([]);
    try {
      const d = await PDFDocument.load(raw.current, { ignoreEncryption: true });
      const n = await PDFDocument.create();
      for (const t of pages) {
        const [pg] = await n.copyPages(d, [t.idx]);
        pg.setRotation(degrees(((d.getPage(t.idx).getRotation().angle) + t.rot) % 360));
        n.addPage(pg);
      }
      setOuts([await savePdf(n, 'organized.pdf')]);
    } catch (e) { setErr(e?.message || 'Rebuild failed.'); }
    setBusy(false);
  }

  return (
    <div className="card">
      <Dropzone accept={tool.accept} multiple={false} files={files} setFiles={(f) => { setFiles(f); load(f); }} />
      {busy && !pages && <p className="dz-note">Rendering page thumbnails locally…</p>}
      {err && <p className="error-note">{err}</p>}
      {pages && (
        <>
          <div className="org-grid">
            {pages.map((t, i) => (
              <div key={`${t.idx}-${i}`} className="org-tile">
                {thumbs[t.idx] ? <img src={thumbs[t.idx]} alt={`page ${t.idx + 1}`} style={{ transform: `rotate(${t.rot}deg)` }} /> : <div className="org-ph">…</div>}
                <div className="org-bar">
                  <button className="mini" onClick={() => move(i, -1)} disabled={!i}>↑</button>
                  <button className="mini" onClick={() => move(i, 1)} disabled={i === pages.length - 1}>↓</button>
                  <button className="mini" onClick={() => rot(i)} title="rotate">⟳</button>
                  <button className="mini" onClick={() => del(i)} title="remove">✕</button>
                </div>
                <span className="org-num">orig {t.idx + 1}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 14 }}>
            <button className="btn" onClick={go} disabled={busy}>{busy ? 'Rebuilding…' : `🗂️ Export ${pages.length} pages →`}</button>
          </div>
        </>
      )}
      {!!outs.length && (
        <div className="result">
          <h3 className="pass">Done ✓</h3>
          <ul className="file-list">{outs.map((o, i) => <li key={i}><a className="fl-name" href={URL.createObjectURL(o.blob)} download={o.name}>{o.name}</a><span className="fl-size">{fmtB(o.size)}</span></li>)}</ul>
        </div>
      )}
    </div>
  );
}

function SignTool({ tool }) {
  const [files, setFiles] = useState([]);
  const [err, setErr] = useState('');
  const [outs, setOuts] = useState([]);
  const [busy, setBusy] = useState(false);
  const [pageNo, setPageNo] = useState(0);
  const [numPages, setNumPages] = useState(0);
  const [stamps, setStamps] = useState([]);
  const [size, setSize] = useState(160);
  const [allPages, setAllPages] = useState(false);
  const pageRef = useRef(null);
  const padRef = useRef(null);
  const meta = useRef(null);
  const drawing = useRef(false);

  async function loadDoc(fs) {
    setErr(''); setOuts([]); setStamps([]);
    if (!fs.length) return;
    try {
      const src = await pdfJsDoc(fs[0]);
      setNumPages(src.numPages);
      await show(src, 0);
    } catch { setErr('Could not render this PDF — try Repair first.'); }
  }
  async function show(srcOrFile, i) {
    let src = srcOrFile;
    if (!src) src = await pdfJsDoc(files[0]);
    const pg = await src.getPage(i + 1);
    const k = 1.2;
    const vp = pg.getViewport({ scale: k });
    const vp1 = pg.getViewport({ scale: 1 });
    meta.current = { k, wpt: vp1.width, hpt: vp1.height };
    const c = pageRef.current;
    if (!c) return;
    c.width = vp.width; c.height = vp.height;
    await pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    drawStamps();
  }
  function drawStamps() {
    const c = pageRef.current, m = meta.current;
    if (!c || !m || !padRef.current) return;
    const ctx = c.getContext('2d');
    const sigH = size * (padRef.current.height / padRef.current.width);
    for (const s of stamps.filter((x) => x.page === pageNo)) {
      ctx.strokeStyle = '#6366f1'; ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.globalAlpha = 0.35;
      ctx.drawImage(padRef.current, (s.x - size / 2) * m.k, (s.y - sigH / 2) * m.k, size * m.k, sigH * m.k);
      ctx.globalAlpha = 1;
      ctx.strokeRect((s.x - size / 2) * m.k, (s.y - sigH / 2) * m.k, size * m.k, sigH * m.k);
      ctx.setLineDash([]);
    }
  }
  function onPageClick(e) {
    if (!meta.current || !files.length) return;
    const rect = pageRef.current.getBoundingClientRect();
    const m = meta.current;
    const x = ((e.clientX - rect.left) / rect.width) * m.wpt;
    const y = ((e.clientY - rect.top) / rect.height) * m.hpt;
    setStamps((s) => [...s, { page: pageNo, x, y }]);
  }
  function padInit(e) {
    const p = padRef.current, ctx = p.getContext('2d');
    drawing.current = true;
    const r = p.getBoundingClientRect();
    ctx.beginPath(); ctx.moveTo(e.clientX - r.left, e.clientY - r.top);
    ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.strokeStyle = '#111827';
  }
  function padMove(e) {
    if (!drawing.current) return;
    const p = padRef.current, ctx = p.getContext('2d');
    const r = p.getBoundingClientRect();
    ctx.lineTo(e.clientX - r.left, e.clientY - r.top); ctx.stroke();
  }
  async function go() {
    setBusy(true); setErr(''); setOuts([]);
    try {
      const d = await loadPdf(files[0]);
      const png = padToBytes();
      const img = await d.embedPng(png);
      const mW = padRef.current.width, mH = padRef.current.height;
      const apply = (page, s) => {
        const w = size, h = size * (mH / mW);
        page.drawImage(img, { x: Math.max(0, Math.min(s.x - w / 2, page.getWidth() - w)), y: Math.max(0, page.getHeight() - (s.y + h / 2)), width: w, height: h });
      };
      if (allPages && stamps.length) {
        for (const i of d.getPageIndices()) stamps.forEach((s) => apply(d.getPage(i), { ...s, y: s.y }));
      } else for (const s of stamps) apply(d.getPage(s.page), s);
      setOuts([await savePdf(d, 'signed.pdf')]);
    } catch (e) { setErr(e?.message || 'Signing failed.'); }
    setBusy(false);
  }
  function padToBytes() {
    const c = document.createElement('canvas');
    c.width = padRef.current.width; c.height = padRef.current.height;
    c.getContext('2d').drawImage(padRef.current, 0, 0);
    const url = c.toDataURL('image/png');
    const bin = atob(url.split(',')[1]);
    return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  }
  return (
    <div className="card">
      <Dropzone accept={tool.accept} multiple={false} files={files} setFiles={(f) => { setFiles(f); loadDoc(f); }} />
      <div style={OPT}>
        <Field label="1) Draw your signature"><canvas ref={padRef} width={420} height={140} className="sigpad" onPointerDown={padInit} onPointerMove={padMove} onPointerUp={() => (drawing.current = false)} onPointerLeave={() => (drawing.current = false)} /></Field>
        <button className="mini" onClick={() => { const p = padRef.current; p.getContext('2d').clearRect(0, 0, p.width, p.height); }}>Clear</button>
      </div>
      {!!numPages && (
        <>
          <div style={OPT}>
            <Field label="2) Page"><select value={pageNo} onChange={(e) => { setPageNo(+e.target.value); show(null, +e.target.value); }}>{Array.from({ length: numPages }, (_, i) => <option key={i} value={i}>Page {i + 1}</option>)}</select></Field>
            <Field label="Stamp width (pt)"><input type="number" value={size} min={40} max={500} onChange={(e) => setSize(+e.target.value || 160)} style={{ width: 80 }} /></Field>
            <label style={{ fontSize: 13 }}><input type="checkbox" checked={allPages} onChange={(e) => setAllPages(e.target.checked)} /> repeat on every page</label>
            <button className="mini" onClick={() => setStamps([])}>Clear stamps</button>
          </div>
          <p className="dz-note">3) Click where the signature should land on the page below.</p>
          <canvas ref={pageRef} onClick={onPageClick} className="sig-page" />
          <div style={{ marginTop: 14 }}><button className="btn" onClick={go} disabled={busy || !stamps.length}>{busy ? 'Embedding…' : '✍️ Export signed PDF →'}</button></div>
        </>
      )}
      {err && <p className="error-note">{err}</p>}
      {!!outs.length && (
        <div className="result"><h3 className="pass">Signed ✓</h3><ul className="file-list">{outs.map((o, i) => <li key={i}><a className="fl-name" href={URL.createObjectURL(o.blob)} download={o.name}>{o.name}</a><span className="fl-size">{fmtB(o.size)}</span></li>)}</ul></div>
      )}
    </div>
  );
}

function Redactor({ tool }) {
  const [files, setFiles] = useState([]);
  const [numPages, setNumPages] = useState(0);
  const [pageNo, setPageNo] = useState(0);
  const [rects, setRects] = useState({});
  const [mode, setMode] = useState('secure');
  const [drag, setDrag] = useState(null);
  const [err, setErr] = useState('');
  const [outs, setOuts] = useState([]);
  const [busy, setBusy] = useState(false);
  const meta = useRef(null);
  const wrapRef = useRef(null);

  const ptFromEvent = (e) => {
    const rect = wrapRef.current.querySelector('canvas').getBoundingClientRect();
    const m = meta.current;
    return { x: ((e.clientX - rect.left) / rect.width) * m.wpt, y: ((e.clientY - rect.top) / rect.height) * m.hpt };
  };
  async function load(fs) {
    setErr(''); setOuts([]); setRects({});
    if (!fs.length) return;
    try {
      const src = await pdfJsDoc(fs[0]);
      setNumPages(src.numPages);
      showPage(src, 0);
    } catch { setErr('Cannot render this PDF — try Repair first.'); }
  }
  async function showPage(srcOrFile, i) {
    const src = srcOrFile || await pdfJsDoc(files[0]);
    const pg = await src.getPage(i + 1);
    const k = 1.2;
    const vp = pg.getViewport({ scale: k }), vp1 = pg.getViewport({ scale: 1 });
    meta.current = { k, wpt: vp1.width, hpt: vp1.height };
    const c = wrapRef.current.querySelector('canvas');
    c.width = vp.width; c.height = vp.height;
    await pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
  }
  function addRect(r) { setRects((s) => ({ ...s, [pageNo]: [...(s[pageNo] || []), r] })); }
  async function go() {
    setBusy(true); setErr(''); setOuts([]);
    try {
      const d = await loadPdf(files[0]);
      const withRects = Object.entries(rects).filter(([, v]) => v.length).map(([k]) => +k);
      if (!withRects.length) throw new Error('Drag at least one redaction box first.');
      if (mode === 'standard') {
        for (const i of withRects) {
          const p = d.getPage(i), H = p.getHeight();
          for (const r of rects[i]) p.drawRectangle({ x: r.x, y: H - r.y - r.h, width: r.w, height: r.h, color: rgb(0, 0, 0) });
        }
        setOuts([await savePdf(d, 'redacted-standard.pdf')]);
      } else {
        const src = await pdfJsDoc(files[0]);
        const n = await PDFDocument.create();
        for (let i = 0; i < d.getPageCount(); i++) {
          if (!withRects.includes(i)) { (await n.copyPages(d, [i])).forEach((p) => n.addPage(p)); continue; }
          const pg = await src.getPage(i + 1);
          // Redaction quality is not a paywalled feature — the raster has to be both legible
          // and irreversible, so every secure run renders at the same high scale.
          const scale = 3;
          const canvas = await renderPage(pg, scale);
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#000';
          for (const r of rects[i]) ctx.fillRect(r.x * scale, r.y * scale, r.w * scale, r.h * scale);
          const jpg = await n.embedJpg(await canvasToJpg(canvas, 0.85).then((b) => b.arrayBuffer()));
          const vp1 = pg.getViewport({ scale: 1 });
          const out = n.addPage([vp1.width, vp1.height]);
          out.drawImage(jpg, { x: 0, y: 0, width: vp1.width, height: vp1.height });
        }
        setOuts([await savePdf(n, 'redacted-secure.pdf')]);
      }
    } catch (e) { setErr(e?.message || 'Redaction failed.'); }
    setBusy(false);
  }
  const pageRects = rects[pageNo] || [];
  return (
    <div className="card">
      <Dropzone accept={tool.accept} multiple={false} files={files} setFiles={(f) => { setFiles(f); load(f); }} />
      {err && <p className="error-note">{err}</p>}
      {!!numPages && (
        <>
          <div style={OPT}>
            <Field label="Page"><select value={pageNo} onChange={(e) => { setPageNo(+e.target.value); showPage(null, +e.target.value); }}>{Array.from({ length: numPages }, (_, i) => <option key={i} value={i}>Page {i + 1}</option>)}</select></Field>
            <Field label="Security"><select value={mode} onChange={(e) => setMode(e.target.value)}><option value="secure">Secure — rasterize, text destroyed (recommended)</option><option value="standard">Standard — black bars only, text stays recoverable</option></select></Field>
            <button className="mini" onClick={() => setRects((s) => ({ ...s, [pageNo]: [] }))}>Clear this page</button>
          </div>
          <p className="dz-note">Drag on the page to blind out an area ({pageRects.length} on this page).</p>
          <div
            ref={wrapRef}
            className="redact-wrap"
            onPointerDown={(e) => { const p = ptFromEvent(e); setDrag({ sx: p.x, sy: p.y, x: p.x, y: p.y, w: 0, h: 0 }); e.target.setPointerCapture?.(e.pointerId); }}
            onPointerMove={(e) => { if (!drag) return; const p = ptFromEvent(e); setDrag({ ...drag, x: Math.min(p.x, drag.sx), y: Math.min(p.y, drag.sy), w: Math.abs(p.x - drag.sx), h: Math.abs(p.y - drag.sy) }); }}
            onPointerUp={() => { if (drag && drag.w > 4 && drag.h > 4) addRect({ x: drag.x, y: drag.y, w: drag.w, h: drag.h }); setDrag(null); }}
          >
            <canvas style={{ width: '100%', display: 'block' }} />
            {pageRects.map((r, i) => <div key={i} className="redact-box" style={{ left: `${(r.x / meta.current?.wpt) * 100}%`, top: `${(r.y / meta.current?.hpt) * 100}%`, width: `${(r.w / meta.current?.wpt) * 100}%`, height: `${(r.h / meta.current?.hpt) * 100}%` }} />)}
            {drag && drag.w > 0 && <div className="redact-box redact-live" style={{ left: `${(drag.x / meta.current?.wpt) * 100}%`, top: `${(drag.y / meta.current?.hpt) * 100}%`, width: `${(drag.w / meta.current?.wpt) * 100}%`, height: `${(drag.h / meta.current?.hpt) * 100}%` }} />}
          </div>
          <div style={{ marginTop: 14 }}><button className="btn" onClick={go} disabled={busy}>{busy ? 'Redacting…' : '⬛ Export redacted PDF →'}</button></div>
        </>
      )}
      {!!outs.length && (
        <div className="result"><h3 className="pass">Redacted ✓ {mode === 'secure' ? '(secure — text under boxes is unrecoverable)' : '(standard overlay)'}</h3>
          <ul className="file-list">{outs.map((o, i) => <li key={i}><a className="fl-name" href={URL.createObjectURL(o.blob)} download={o.name}>{o.name}</a><span className="fl-size">{fmtB(o.size)}</span></li>)}</ul></div>
      )}
    </div>
  );
}

function OcrTool({ tool }) {
  const [files, setFiles] = useState([]);
  const [lang, setLang] = useState('eng');
  const [proAcc, setProAcc] = useState(false);
  const [taste, setTaste] = useTaste();
  const [proClean, setProClean] = useState(false);
  const [status, setStatus] = useState('');
  const [err, setErr] = useState('');
  const [outs, setOuts] = useState([]);
  const [busy, setBusy] = useState(false);

  async function go() {
    if ((proAcc || proClean) && taste <= 0) { setErr('PRO_LOCK'); setBusy(false); return; }
    setBusy(true); setErr(''); setOuts([]);
    let worker;
    try {
      if (proAcc || proClean) { consumeTaste(); setTaste(tasteLeft()); }
      const { createWorker } = await import('tesseract.js');
      setStatus('Warming up the OCR engine (first run downloads ~4MB)…');
      worker = await createWorker(lang);
      const src = await pdfJsDoc(files[0]);
      const d = await PDFDocument.create();
      const font = await d.embedFont(StandardFonts.Helvetica);
      let totalWords = 0;
      for (let i = 1; i <= src.numPages; i++) {
        setStatus(`Recognizing page ${i} of ${src.numPages}…`);
        const pg = await src.getPage(i);
        const scale = proAcc ? 3 : 2;
        const canvas = await renderPage(pg, scale);
        if (proClean) {
          const cx = canvas.getContext('2d');
          const img = cx.getImageData(0, 0, canvas.width, canvas.height);
          const d8 = img.data;
          let min = 255, max = 0;
          for (let pxi = 0; pxi < d8.length; pxi += 4) {
            const g = (d8[pxi] * 0.299 + d8[pxi + 1] * 0.587 + d8[pxi + 2] * 0.114) | 0;
            if (g < min) min = g; if (g > max) max = g;
            d8[pxi] = d8[pxi + 1] = d8[pxi + 2] = g;
          }
          const span = Math.max(1, max - min);
          for (let pxi = 0; pxi < d8.length; pxi += 4) {
            let v = ((d8[pxi] - min) * 255) / span;
            v = v > 150 ? 255 : v < 90 ? 0 : v;
            d8[pxi] = d8[pxi + 1] = d8[pxi + 2] = v;
          }
          cx.putImageData(img, 0, 0);
        }
        const vp1 = pg.getViewport({ scale: 1 });
        const jpg = await d.embedJpg(await canvasToJpg(canvas, 0.9).then((b) => b.arrayBuffer()));
        const page = d.addPage([vp1.width, vp1.height]);
        page.drawImage(jpg, { x: 0, y: 0, width: vp1.width, height: vp1.height });
        const { data } = await worker.recognize(canvas, {}, { text: true, blocks: true });
        const words = [];
        for (const b of data.blocks || []) for (const p of b.paragraphs || []) for (const l of p.lines || []) for (const w of l.words || []) words.push(w);
        for (const w of words) {
          if (!w.text?.trim() || !w.bbox) continue;
          const x = w.bbox.x0 / scale, bottom = vp1.height - w.bbox.y1 / scale;
          const h = Math.max(4, (w.bbox.y1 - w.bbox.y0) / scale);
          try { page.drawText(w.text, { x, y: bottom, size: h * 0.86, font, opacity: 0.001 }); totalWords++; } catch { /* skip glyphs Helvetica lacks */ }
        }
      }
      setStatus('');
      const out = await savePdf(d, 'searchable.pdf');
      out.note = `${totalWords} words now searchable`;
      setOuts([out]);
    } catch (e) { setErr(e?.message || 'OCR failed — is the language model reachable?'); setStatus(''); }
    if (worker) await worker.terminate();
    setBusy(false);
  }
  return (
    <div className="card">
      <Dropzone accept={tool.accept} multiple={false} files={files} setFiles={setFiles} />
      <div style={OPT}>
        <Field label="Language"><select value={lang} onChange={(e) => setLang(e.target.value)}><option value="eng">English</option><option value="hin">Hindi</option><option value="spa">Spanish</option><option value="fra">French</option><option value="deu">German</option><option value="ara">Arabic</option></select></Field>
        <div className="opt-field"><label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
          <input type="checkbox" checked={proAcc} onChange={(e) => { setProAcc(e.target.checked); if (e.target.checked && taste <= 0) setErr('PRO_LOCK'); }} />
          300 dpi Pro accuracy <span className="pro-badge">PRO</span> <TasteMeter left={taste} />
        </label></div>
        <div className="opt-field"><label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
          <input type="checkbox" checked={proClean} onChange={(e) => { setProClean(e.target.checked); if (e.target.checked && taste <= 0) setErr('PRO_LOCK'); }} />
          De-noise &amp; binarize bad scans <span className="pro-badge">PRO</span>
        </label></div>
        <button className="btn" onClick={go} disabled={!files.length || busy}>{busy ? 'Reading your pages…' : '🔍 Make it searchable →'}</button>
      </div>
      {status && <p className="dz-note">{status}</p>}
      {err === 'PRO_LOCK' ? <UpgradeNote feature="300 dpi Pro OCR" /> : err && <p className="error-note">{err}</p>}
      {!!outs.length && (
        <div className="result"><h3 className="pass">Searchable ✓</h3>
          <ul className="file-list">{outs.map((o, i) => <li key={i}><a className="fl-name" href={URL.createObjectURL(o.blob)} download={o.name}>{o.name}</a><span className="fl-size">{fmtB(o.size)}{o.note ? ` · ${o.note}` : ''}</span></li>)}</ul></div>
      )}
    </div>
  );
}

async function pageLines(page) {
  const tc = await page.getTextContent();
  const rows = new Map();
  for (const it of tc.items) {
    if (!it.str || !it.str.trim()) continue;
    const y = Math.round(it.transform[5] / 3) * 3;
    const x = it.transform[4];
    if (!rows.has(y)) rows.set(y, []);
    rows.get(y).push([x, it.str]);
  }
  return [...rows.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, parts]) => parts.sort((p, q) => p[0] - q[0]).map((p) => p[1]).join(' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function diffLines(a, b) {
  if (a.length * b.length > 900000) {
    const sa = new Set(a), sb = new Set(b);
    return { removed: a.filter((l) => !sb.has(l)), added: b.filter((l) => !sa.has(l)) };
  }
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const removed = [], added = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) removed.push(a[i++]);
    else added.push(b[j++]);
  }
  while (i < n) removed.push(a[i++]);
  while (j < m) added.push(b[j++]);
  return { removed, added };
}

function CompareTool({ tool }) {
  const [files, setFiles] = useState([]);
  const [proView, setProView] = useState(false);
  const [taste, setTaste] = useTaste();
  const [shots, setShots] = useState({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [status, setStatus] = useState('');
  const [report, setReport] = useState(null);
  const [out, setOut] = useState(null);

  async function go() {
    if (files.length !== 2) { setErr('Drop exactly two PDFs — older version first, newer second.'); return; }
    setBusy(true); setErr(''); setReport(null); setOut(null);
    try {
      const [A, B] = await Promise.all(files.map((f) => pdfJsDoc(f)));
      const n = Math.max(A.numPages, B.numPages);
      const pages = [];
      for (let p = 1; p <= n; p++) {
        setStatus(`Comparing page ${p} of ${n}…`);
        const la = p <= A.numPages ? await pageLines(await A.getPage(p)) : [];
        const lb = p <= B.numPages ? await pageLines(await B.getPage(p)) : [];
        const d = la.join('\n') === lb.join('\n') ? { removed: [], added: [] } : diffLines(la, lb);
        pages.push({ page: p, ...d });
        if (p % 10 === 0) await new Promise((r) => setTimeout(r));
      }
      const changed = pages.filter((x) => x.removed.length || x.added.length);
      setReport(pages);
      setShots({});
      if (proView && changed.length) {
        if (taste <= 0) setErr('PRO_LOCK');
        else {
          consumeTaste(); setTaste(tasteLeft());
          const got = {};
          for (const x of changed.slice(0, 12)) {
            if (x.page <= A.numPages) got[x.page] = { a: (await renderPage(await A.getPage(x.page), 1)).toDataURL('image/jpeg', 0.65) };
            if (x.page <= B.numPages) (got[x.page] ||= {}).b = (await renderPage(await B.getPage(x.page), 1)).toDataURL('image/jpeg', 0.65);
          }
          setShots(got);
        }
      }
      const txt = [
        `AbetPDF comparison — ${files[0].name} vs ${files[1].name}`,
        `${n} pages compared · ${changed.length} page(s) with text changes`, '',
        ...changed.map((x) => `Page ${x.page}:\n${x.removed.map((l) => `- ${l}`).join('\n')}${x.removed.length ? '\n' : ''}${x.added.map((l) => `+ ${l}`).join('\n')}${x.added.length ? '\n' : ''}`).join('\n'),
        changed.length ? '' : 'No textual differences found.',
      ].join('\n');
      const blob = new Blob([txt], { type: 'text/plain' });
      setOut({ name: 'comparison.txt', blob, size: blob.size });
      setStatus(changed.length ? `${changed.length} of ${n} pages differ.` : `Identical text on all ${n} pages ✓`);
    } catch (e) {
      setErr(e.message || 'Could not read one of the files.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <Dropzone accept={tool.accept} multiple files={files} setFiles={setFiles} />
      {!!files.length && (
        <ul className="file-list">{files.map((f, i) => <li key={i}><span className="fl-name">{i + 1}. {f.name}</span><span className="fl-size">{fmtB(f.size)}</span></li>)}</ul>
      )}
      <div style={OPT}>
        <div className="opt-field"><label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
          <input type="checkbox" checked={proView} onChange={(e) => setProView(e.target.checked)} />
          Side-by-side snapshots of changed pages <span className="pro-badge">PRO</span> <TasteMeter left={taste} />
        </label></div>
        <button className="btn" onClick={go} disabled={files.length !== 2 || busy}>{busy ? 'Reading both documents…' : '⚖️ Compare →'}</button>
      </div>
      {status && <p className="dz-note">{status}</p>}
      {err && <p className="error-note">{err}</p>}
      {report && (
        <div className="cmp-report">
          {report.filter((x) => x.removed.length || x.added.length).map((x) => (
            <div key={x.page} className="cmp-page">
              <h4 className="cmp-h">Page {x.page}</h4>
              {x.removed.map((l, i) => <p key={'r' + i} className="cmp-del">− {l}</p>)}
              {x.added.map((l, i) => <p key={'a' + i} className="cmp-add">+ {l}</p>)}
              {shots[x.page] && (
                <div className="cmp-shots">
                  {shots[x.page].a && <figure><img src={shots[x.page].a} alt={`page ${x.page} before`} /><figcaption>older</figcaption></figure>}
                  {shots[x.page].b && <figure><img src={shots[x.page].b} alt={`page ${x.page} after`} /><figcaption>newer</figcaption></figure>}
                </div>
              )}
            </div>
          ))}
          {!report.some((x) => x.removed.length || x.added.length) && <p className="pass">Both PDFs contain exactly the same text, page by page.</p>}
        </div>
      )}
      {!!out && (
        <div className="result"><h3 className="pass">Report ready ✓</h3>
          <ul className="file-list"><li><a className="fl-name" href={URL.createObjectURL(out.blob)} download={out.name}>{out.name}</a><span className="fl-size">{fmtB(out.size)}</span></li></ul>
        </div>
      )}
    </div>
  );
}

function FormFiller({ tool }) {
  const [files, setFiles] = useState([]);
  const [fields, setFields] = useState(null);
  const vals = useRef({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [status, setStatus] = useState('');
  const [outs, setOuts] = useState([]);
  const [flatten, setFlatten] = useState(true);
  const fileRef = useRef(null);

  async function inspect(fs) {
    if (!fs.length) return;
    setErr(''); setOuts([]); setFields(null); setStatus('');
    fileRef.current = fs[0];
    try {
      const doc = await PDFDocument.load(await bufOf(fs[0]), { ignoreEncryption: true });
      const found = doc.getForm().getFields().map((f) => {
        const name = f.getName();
        // `value` is the render-time seed for the uncontrolled inputs below:
        // reading that seed from `vals.current` during render is what React's
        // ref rule forbids, so each field carries its own initial value.
        if (f instanceof PDFTextField) return { name, kind: 'text', multiline: f.isMultiline(), max: f.getMaxLength(), value: '' };
        if (f instanceof PDFCheckBox) return { name, kind: 'check', on: f.isChecked(), value: f.isChecked() };
        if (f instanceof PDFRadioGroup) return { name, kind: 'radio', options: f.getOptions(), on: f.getSelected(), value: f.getSelected() || '' };
        if (f instanceof PDFDropdown) return { name, kind: 'select', options: f.getOptions(), on: f.getSelected(), value: f.getSelected() || '' };
        if (f instanceof PDFOptionList) return { name, kind: 'select', options: f.getOptions(), on: (f.getSelected()[0] || ''), value: f.getSelected()[0] || '' };
        return { name, kind: 'other' };
      }).filter((f) => f.kind !== 'other');
      vals.current = {};
      found.forEach((f) => {
        if (f.kind === 'check') vals.current[f.name] = !!f.on;
        else vals.current[f.name] = f.on || '';
      });
      setFields(found);
      if (!found.length) setStatus('This PDF has no fillable form fields — it may be a scanned image. Try OCR it first.');
    } catch {
      setErr('Could not read that PDF — try Repair PDF on it first.');
    }
  }

  async function go() {
    setBusy(true); setErr(''); setOuts([]);
    try {
      const doc = await PDFDocument.load(await bufOf(fileRef.current), { ignoreEncryption: true });
      const form = doc.getForm();
      let filled = 0;
      for (const f of form.getFields()) {
        const v = vals.current[f.getName()];
        try {
          if (f instanceof PDFTextField && v != null && v !== '') { f.setText(v); filled++; }
          else if (f instanceof PDFCheckBox) { v ? f.check() : f.uncheck(); if (v) filled++; }
          else if ((f instanceof PDFRadioGroup || f instanceof PDFDropdown) && v) { f.select(v); filled++; }
          else if (f instanceof PDFOptionList && v) { f.select([v]); filled++; }
        } catch { /* leave untouched */ }
      }
      form.updateFieldAppearances();
      if (flatten) form.flatten();
      const out = await savePdf(doc, flatten ? 'form-flattened.pdf' : 'form-filled.pdf');
      out.note = `${filled} field${filled === 1 ? '' : 's'} ${flatten ? 'filled & flattened' : 'filled (still editable)'}`;
      setOuts([out]);
    } catch (e) {
      setErr(e.message || 'Could not save the filled form.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <Dropzone accept={tool.accept} multiple={false} files={files} setFiles={(fs) => { setFiles(fs); inspect(fs); }} />
      {!!files.length && (
        <ul className="file-list"><li><span className="fl-name">{files[0].name}</span><span className="fl-size">{fmtB(files[0].size)}</span></li></ul>
      )}
      {fields && fields.length > 0 && (
        <div className="form-sheet">
          <div className="opt-field" style={{ marginBottom: 10 }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
              <input type="checkbox" checked={flatten} onChange={(e) => setFlatten(e.target.checked)} />
              Flatten when saving (locks answers; uncheck to keep editable)
            </label>
          </div>
          {fields.map((f, i) => (
            <div key={i} className="form-row">
              <label className="form-label" title={f.name}>{f.name}</label>
              {f.kind === 'text' && (f.multiline
                ? <textarea rows={3} defaultValue={f.value} onChange={(e) => (vals.current[f.name] = e.target.value)} />
                : <input type="text" defaultValue={f.value} maxLength={f.max || undefined} onChange={(e) => (vals.current[f.name] = e.target.value)} />)}
              {f.kind === 'check' && <input type="checkbox" defaultChecked={!!f.value} onChange={(e) => (vals.current[f.name] = e.target.checked)} />}
              {(f.kind === 'radio' || f.kind === 'select') && (
                <select defaultValue={f.value} onChange={(e) => (vals.current[f.name] = e.target.value)}>
                  <option value="">— not set —</option>
                  {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              )}
            </div>
          ))}
          <button className="btn" onClick={go} disabled={busy} style={{ marginTop: 12 }}>{busy ? 'Writing your answers…' : '🗒️ Fill & download →'}</button>
        </div>
      )}
      {status && <p className="dz-note">{status}</p>}
      {err && <p className="error-note">{err}</p>}
      {!!outs.length && (
        <div className="result"><h3 className="pass">Form ready ✓</h3>
          <ul className="file-list">{outs.map((o, i) => <li key={i}><a className="fl-name" href={URL.createObjectURL(o.blob)} download={o.name}>{o.name}</a><span className="fl-size">{fmtB(o.size)}{o.note ? ` · ${o.note}` : ''}</span></li>)}</ul>
        </div>
      )}
    </div>
  );
}

function WordExport({ tool }) {
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [status, setStatus] = useState('');
  const [outs, setOuts] = useState([]);

  async function go() {
    setBusy(true); setErr(''); setOuts([]);
    try {
      const src = await pdfJsDoc(files[0]);
      const pages = [];
      for (let i = 1; i <= src.numPages; i++) {
        setStatus(`Reading page ${i} of ${src.numPages}…`);
        pages.push(await pageLines(await src.getPage(i)));
        if (i % 5 === 0) await new Promise((r) => setTimeout(r));
      }
      const lines = pages.reduce((a, p) => a + p.length, 0);
      if (!lines) throw new Error('No text layer found — this looks like a scan. Run OCR on it first, then convert.');
      const blob = await buildDocxBlob(pages);
      setOuts([{ name: files[0].name.replace(/\.pdf$/i, '') + '.docx', blob, size: blob.size, note: `${src.numPages} pages · ${lines} lines` }]);
    } catch (e) {
      setErr(e.message || 'Could not convert that file.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <Dropzone accept={tool.accept} multiple={false} files={files} setFiles={setFiles} />
      {!!files.length && (
        <ul className="file-list"><li><span className="fl-name">{files[0].name}</span><span className="fl-size">{fmtB(files[0].size)}</span></li></ul>
      )}
      <div style={OPT}>
        <button className="btn" onClick={go} disabled={!files.length || busy}>{busy ? 'Rebuilding your document…' : '📃 Convert to Word →'}</button>
      </div>
      {status && <p className="dz-note">{status}</p>}
      {err && <p className="error-note">{err}</p>}
      {!!outs.length && (
        <div className="result"><h3 className="pass">Word document ready ✓</h3>
          <ul className="file-list">{outs.map((o, i) => <li key={i}><a className="fl-name" href={URL.createObjectURL(o.blob)} download={o.name}>{o.name}</a><span className="fl-size">{fmtB(o.size)}{o.note ? ` · ${o.note}` : ''}</span></li>)}</ul>
        </div>
      )}
    </div>
  );
}

function BatchTool({ tool }) {
  const [taste, setTaste] = useTaste();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [status, setStatus] = useState('');
  const [outs, setOuts] = useState([]);
  const [picked, setPicked] = useState(null);
  const dirRef = useRef(null);

  async function go(files) {
    const conv = files.filter((f) => /\.(docx|xlsx|pptx)$/i.test(f.name)).slice(0, 25);
    const seen = files.filter((f) => /\.(docx|xlsx|pptx)$/i.test(f.name)).length;
    setOuts([]); setErr('');
    if (!conv.length) { setErr('That folder has no .docx / .xlsx / .pptx files in it.'); return; }
    if (taste <= 0) { setErr('PRO_LOCK'); return; }
    consumeTaste(); setTaste(tasteLeft());
    setBusy(true);
    const res = [];
    let skipped = 0;
    for (let i = 0; i < conv.length; i++) {
      const f = conv[i];
      setStatus(`Converting ${i + 1} of ${conv.length}: ${f.name}${seen > 25 ? ` (${seen - 25} not in this pass)` : ''}`);
      try {
        const buf = await bufOf(f);
        let d;
        if (/\.docx$/i.test(f.name)) d = await typesetPdf((await docxToParagraphs(buf)).join('\n'), { size: 11 });
        else if (/\.xlsx$/i.test(f.name)) d = await typesetSheets(await xlsxSheets(buf));
        else d = await slidesPdf(await pptxSlides(buf));
        res.push(await savePdf(d, f.name.replace(/\.[a-z]+$/i, '') + '.pdf'));
      } catch { skipped++; }
      await new Promise((r) => setTimeout(r));
    }
    setOuts(res);
    setStatus(`${res.length} converted${skipped ? ` · ${skipped} with no readable text skipped` : ''} — all on your machine`);
    setBusy(false);
  }

  return (
    <div className="card">
      <div className="batch-pick">
        <input ref={dirRef} type="file" multiple hidden
          {...{ webkitdirectory: '', directory: '' }}
          onChange={(e) => { const fs = [...(e.target.files || [])]; setPicked(fs.length ? { n: fs.filter((f) => /\.(docx|xlsx|pptx)$/i.test(f.name)).length, total: fs.length } : null); }} />
        <button className="btn btn-ghost" onClick={() => dirRef.current.click()}>📁 Choose a folder…</button>
        {picked && <span className="dz-note" style={{ marginLeft: 10 }}>{picked.n} convertible file{picked.n === 1 ? '' : 's'} in {picked.total} picked</span>}
      </div>
      <div style={OPT}>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, marginBottom: 8 }}>
          <input type="checkbox" onChange={(e) => { if (e.target.checked && taste <= 0) setErr('PRO_LOCK'); }} />
          Convert everything <span className="pro-badge">PRO</span> <TasteMeter left={taste} />
        </label>
        <button className="btn" onClick={() => go(picked && dirRef.current.files ? [...dirRef.current.files] : [])} disabled={busy || !picked}>
          {busy ? 'Working through your folder…' : '📦 Batch convert →'}
        </button>
      </div>
      {status && <p className="dz-note">{status}</p>}
      {err === 'PRO_LOCK' ? <UpgradeNote feature="Batch convert" /> : err && <p className="error-note">{err}</p>}
      {!!outs.length && (
        <div className="result"><h3 className="pass">{outs.length} PDFs ready ✓</h3>
          <ul className="file-list">{outs.map((o, i) => <li key={i}><a className="fl-name" href={URL.createObjectURL(o.blob)} download={o.name}>{o.name}</a><span className="fl-size">{fmtB(o.size)}</span></li>)}</ul>
        </div>
      )}
    </div>
  );
}
