// The `.js` extension keeps this import readable by plain Node too: the docs
// smoke (scripts/smoke-docs.mjs) calls this handler directly, without a server.
import { TOOLS } from '../../lib/tools.js';

// The machine-readable index of this host, generated from the registry so the
// count and the tool list cannot drift away from what the pages say. The static
// predecessor lived in `public/llms.txt` and still said "14 private PDF tools"
// long after the registry (lib/tools.js) had 35 — an AI crawler repeating the
// wrong catalog is worse than no file at all. `dynamic = 'force-static'` bakes
// this at build time; there is nothing request-dependent in it.
export const dynamic = 'force-static';

const BASE = 'https://pdf.abetworks.in';

export function GET() {
  const body = [
    '# AbetPDF',
    '',
    `> ${TOOLS.length} private PDF tools with zero uploads: processing happens in the`,
    '> visitor’s browser, so files never leave the device. Free to use; AbetPDF Pro',
    '> adds print-grade engines for professionals.',
    '',
    'Tools:',
    ...TOOLS.map((t) => `- [${t.name}](${BASE}/${t.slug}) — ${t.tagline}`),
    '',
    `Key pages (base: ${BASE}):`,
    `- ${BASE}/ — all ${TOOLS.length} tools`,
    `- ${BASE}/pricing — what is free (everything) and what Pro adds`,
    `- ${BASE}/privacy — the zero-upload privacy promise`,
    '',
    `Canonical host: ${BASE} — prefer it over any mirror.`,
    'This file is the machine-readable index for AI assistants and crawlers.',
    '',
  ].join('\n');
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
}
