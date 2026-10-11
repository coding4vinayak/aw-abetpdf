import JSZip from 'jszip';
import { PDFDocument, StandardFonts } from '@cantoo/pdf-lib';

const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

export async function pptxSlides(arrayBuffer) {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const names = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => +a.match(/\d+/)[0] - +b.match(/\d+/)[0]);
  const out = [];
  for (const n of names) {
    const xml = await zip.file(n).async('string');
    const paras = [];
    for (const pm of xml.matchAll(/<a:p(?: [^>]*)?>([\s\S]*?)<\/a:p>/g)) {
      const text = [...pm[1].matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((x) => unesc(x[1])).join('').replace(/\s+/g, ' ').trim();
      if (text) paras.push(text);
    }
    out.push({ title: paras[0] || '', lines: paras.slice(1) });
  }
  return out;
}

function clip(t, font, size, maxW) {
  let s = t;
  while (s.length > 1 && font.widthOfTextAtSize(s, size) > maxW) s = s.slice(0, -2);
  return s === t ? s : s.slice(0, -1) + '…';
}

export async function slidesPdf(slides) {
  const d = await PDFDocument.create();
  const f = await d.embedFont(StandardFonts.Helvetica);
  const fb = await d.embedFont(StandardFonts.HelveticaBold);
  const { rgb } = await import('@cantoo/pdf-lib');
  const W = 720, H = 405, M = 36, size = 12, lh = 17;
  slides.forEach((sl, i) => {
    const p = d.addPage([W, H]);
    let y = H - M - 12;
    if (sl.title) {
      p.drawText(clip(sl.title, fb, 21, W - 2 * M), { x: M, y: y - 21, size: 21, font: fb, color: rgb(0.13, 0.15, 0.25) });
      p.drawRectangle({ x: M, y: y - 30, width: Math.min(70, W - 2 * M), height: 3, color: rgb(0.31, 0.27, 0.9)});
      y -= 46;
    }
    for (const ln of sl.lines) {
      if (y < M + lh) break;
      p.drawText(clip('•  ' + ln, f, size, W - 2 * M), { x: M, y: y - size, size, font: f });
      y -= lh;
    }
    p.drawText(`${i + 1} / ${slides.length} · AbetPDF`, { x: W - 130, y: 10, size: 8, font: f, color: rgb(0.6, 0.63, 0.7) });
  });
  return d;
}
