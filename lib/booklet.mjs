// Saddle-stitch 2-up imposition, shared by the widget and the headless tests.
// Input: array of {width, height} for each content page (blanks padded to a
// multiple of 4). Output: sheet list, each {pages:[leftIdx,rightIdx], width, height}.

export function imposeBooklet(sizes) {
  const total = Math.ceil(sizes.length / 4) * 4;
  const nSheets = total / 4;
  const w = sizes.reduce((a, s) => Math.max(a, s.width), 0);
  const h = sizes.reduce((a, s) => Math.max(a, s.height), 0);
  const sheets = [];
  for (let s = 0; s < nSheets; s++) {
    const last = total - 2 * s;  // 1-based
    const first = 2 * s + 1;      // 1-based
    sheets.push({ pages: [last - 1, first - 1], width: 2 * w, height: h });        // front
    sheets.push({ pages: [first, last - 2], width: 2 * w, height: h });            // back
  }
  return sheets;
}
