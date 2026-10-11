// Coordinate-based table reconstruction from PDF text content.
// Pure: takes pdf.js getTextContent() items + page height, returns cell rows.

function groupRows(items, pageH) {
  const parts = items
    .filter((it) => it.str && it.str.trim())
    .map((it) => ({
      x0: it.transform[4],
      x1: it.transform[4] + (it.width || it.str.length * 6),
      yc: pageH - it.transform[5] - (it.height || 10) / 2,
      str: it.str,
    }))
    .sort((a, b) => a.yc - b.yc || a.x0 - b.x0);
  const rows = [];
  let cur = null, curY = null, tol = 4;
  for (const p of parts) {
    if (!p.str.trim()) continue;
    tol = Math.max(3, Math.min(9, (p.yc - (curY ?? p.yc)) || 4));
    if (!cur || Math.abs(p.yc - curY) > tol) { cur = []; rows.push(cur); curY = p.yc; }
    cur.push(p);
    curY = (curY + p.yc) / 2;
  }
  return rows.filter((r) => r.length);
}

function clusterColumns(rows) {
  const starts = [];
  for (const r of rows) for (const p of r) {
    if (!starts.some((s) => Math.abs(s - p.x0) < 8)) starts.push(p.x0);
  }
  starts.sort((a, b) => a - b);
  if (starts.length < 2) return null;
  const merged = [starts[0]];
  for (const s of starts.slice(1)) {
    const gap = s - merged[merged.length - 1];
    if (gap < 14) continue;
    merged.push(s);
  }
  if (merged.length < 2) return null;
  return merged;
}

function colIndex(cols, x) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < cols.length; i++) {
    const d = Math.abs(x - cols[i]);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

// Returns { rows, tabular } for one page's text items.
export function extractPageTable(items, pageH) {
  const rows = groupRows(items, pageH);
  if (!rows.length) return { rows: [], tabular: false };
  const cols = clusterColumns(rows);
  if (!cols) return { rows: rows.map((r) => [r.map((p) => p.str).join(' ').replace(/\s+/g, ' ').trim()]), tabular: false };
  const grid = rows.map((r) => {
    const cells = new Array(cols.length).fill(null);
    for (const p of [...r].sort((a, b) => a.x0 - b.x0)) {
      const ci = colIndex(cols, p.x0);
      cells[ci] = cells[ci] === null ? p.str : cells[ci] + ' ' + p.str;
    }
    return cells.map((c) => (c || '').replace(/\s+/g, ' ').trim());
  });
  const filledRows = grid.filter((r) => r.filter(Boolean).length >= 2).length;
  const tabular = cols.length >= 2 && filledRows >= Math.max(2, rows.length * 0.4);
  if (!tabular) {
    return { rows: rows.map((r) => [r.map((p) => p.str).join(' ').replace(/\s+/g, ' ').trim()]), tabular: false };
  }
  return { rows: grid, tabular: true };
}
