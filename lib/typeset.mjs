import { PDFDocument, StandardFonts } from '@cantoo/pdf-lib';

// line: string | [{text,bold,italic}] | null (null = force new page)
export async function typesetPdf(raw, { size = 11, mono = false } = {}) {
  const d = await PDFDocument.create();
  const F = {
    n: await d.embedFont(mono ? StandardFonts.Courier : StandardFonts.Helvetica),
    b: await d.embedFont(mono ? StandardFonts.CourierBold : StandardFonts.HelveticaBold),
    i: await d.embedFont(mono ? StandardFonts.CourierOblique : StandardFonts.HelveticaOblique),
    bi: await d.embedFont(mono ? StandardFonts.CourierBoldOblique : StandardFonts.HelveticaBoldOblique),
  };
  const fontOf = (t) => F[(t.b ? 'b' : '') + (t.i ? 'i' : '') || 'n'];
  const M = 56, W = 595.28, H = 841.89, lh = size * 1.4, maxW = W - 2 * M;
  let page = d.addPage([W, H]), y = H - M;
  const newPage = () => { page = d.addPage([W, H]); y = H - M; };
  const flush = (line) => {
    if (!line.length) { y -= lh; if (y < M) newPage(); return; }
    let x = M;
    line.forEach((t, idx) => {
      const f = fontOf(t);
      const str = idx ? ' ' + t.t : t.t;
      page.drawText(str, { x, y, size, font: f });
      x += f.widthOfTextAtSize(str, size);
    });
    y -= lh;
    if (y < M) newPage();
  };
  const lines = typeof raw === 'string' ? raw.replace(/\r/g, '').split('\n') : raw;
  for (const ln of lines) {
    if (ln === null) { newPage(); continue; }
    const parts = Array.isArray(ln) ? ln : [{ text: ln, bold: false, italic: false }];
    const words = [];
    for (const run of parts) {
      if (!run || !run.text) continue;
      for (const w2 of run.text.split(' ')) if (w2 !== '') words.push({ t: w2, b: !!run.bold, i: !!run.italic });
    }
    // A word wider than the text area (URL, hash, base64 blob, unbroken CSV row)
    // would otherwise draw once and run off the page edge, silently dropping the tail.
    const tokens = [];
    for (const tk of words) {
      const f = fontOf(tk);
      if (f.widthOfTextAtSize(tk.t, size) <= maxW) { tokens.push(tk); continue; }
      let buf = '';
      for (const ch of tk.t) {
        if (buf && f.widthOfTextAtSize(buf + ch, size) > maxW) { tokens.push({ ...tk, t: buf }); buf = ch; }
        else buf += ch;
      }
      if (buf) tokens.push({ ...tk, t: buf });
    }
    let cur = [], curW = 0;
    for (const tk of tokens) {
      const f = fontOf(tk);
      const add = (cur.length ? ' ' : '') + tk.t;
      const wAdv = f.widthOfTextAtSize(add, size);
      if (curW + wAdv > maxW) { flush(cur); cur = [tk]; curW = f.widthOfTextAtSize(tk.t, size); }
      else { cur.push(tk); curW += wAdv; }
    }
    flush(cur);
  }
  return d;
}

export async function typesetSheets(sheets) {
  const { rgb } = await import('@cantoo/pdf-lib');
  const d = await PDFDocument.create();
  const font = await d.embedFont(StandardFonts.Helvetica);
  const bold = await d.embedFont(StandardFonts.HelveticaBold);
  const M = 40, W = 595.28, H = 841.89, maxW = W - 2 * M, size = 9, lh = 13;
  let page = null, y = 0;
  const newPage = () => { page = d.addPage([W, H]); y = H - M; };
  for (const sheet of sheets) {
    const grid = sheet.rows.map((cells) => {
      const max = cells.reduce((m, c) => Math.max(m, c.col), -1);
      const arr = Array(max + 1).fill('');
      cells.forEach((c) => { arr[c.col] = c.val; });
      return arr;
    }).filter((r) => r.some((x) => x !== ''));
    const cols = Math.max(1, ...grid.map((r) => r.length));
    if (!cols || !grid.length) continue;
    const w = [];
    for (let ci = 0; ci < cols; ci++) {
      let mx = 8;
      for (const r of grid) { const t = (r[ci] || '').slice(0, 42); mx = Math.max(mx, font.widthOfTextAtSize(t, size)); }
      w.push(mx);
    }
    let total = w.reduce((a, b) => a + b, 0) + cols * 4;
    if (total > maxW) { const k = maxW / total; for (let i = 0; i < cols; i++) w[i] *= k; total = maxW; }
    newPage();
    page.drawText(sheet.name, { x: M, y: y - size, size: 12, font: bold, color: rgb(0.15, 0.18, 0.28) });
    y -= 22;
    grid.forEach((row, ri) => {
      if (y < M + lh) newPage();
      if (ri === 0) page.drawRectangle({ x: M - 2, y: y - 3, width: total, height: lh + 2, color: rgb(0.93, 0.94, 0.97) });
      let cx = M;
      for (let ci = 0; ci < cols; ci++) {
        const val = row[ci] || '';
        if (!val) { cx += w[ci] + 4; continue; }
        const f = ri === 0 ? bold : font;
        let t = val;
        while (t.length > 1 && f.widthOfTextAtSize(t, size) > w[ci]) t = t.slice(0, -2);
        const tw = f.widthOfTextAtSize(t, size);
        const isNum = /^-?\d[\d,.]*%?$/.test(val);
        page.drawText(t, { x: isNum ? cx + w[ci] - tw : cx, y: y - size + 3, size, font: f });
        cx += w[ci] + 4;
      }
      y -= lh;
    });
    y -= 10;
  }
  if (!page) { d.addPage([W, H]).drawText('(empty workbook)', { x: M, y: H - M, size, font }); }
  return d;
}
