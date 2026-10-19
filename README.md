# AbetPDF — 35 private PDF tools, zero uploads

![CI](https://github.com/coding4vinayak/aw-abetpdf/actions/workflows/ci.yml/badge.svg)


Merge, split, compress, organize, protect (AES-256), unlock, repair, rotate, delete pages,
watermark, page numbers, PDF↔JPG, PDF→text — plus OCR, redaction, signing, forms, booklet
imposition, Word/Excel/PowerPoint conversion and more; 35 in all. Every job runs 100% in
the visitor's browser (pdf-lib / pdf.js) — files never touch a server, which is the
product's core differentiator.

## Run / build
```bash
npm install
npm run dev      # http://localhost:3000
npm run lint     # eslint-config-next, zero problems
npm run test     # engine smoke checks (docx/form/meta/excel/booklet/select/docs)
npm run build    # static SSG for all 35 tool pages
```

## Deploy (either, ~2 minutes)
**Vercel:** Import repo → auto-detected Next.js → Deploy → Settings → Domains → add your domain.
**Render:** import `render.yaml` (Blueprint) — or New Web Service from the repo → build `npm ci && npm run build`, start `npm run start`. Node 22.

One optional env: `NEXT_PUBLIC_STRIPE_PAYMENT_LINK` — set it and /pricing shows the payment link; blank keeps the page inert (no dead button). No other configuration is needed.

The Render health check is `/api/health`: it emits the tool count from the registry the pages are built from and writes-and-removes a probe file in `data/`, so a build with a broken registry or a read-only disk 503s instead of taking traffic.

## Structure
- `lib/tools.js` — all tool copy (hero, how-it-works, FAQs) in one place
- `app/[slug]/page.jsx` — SSG tool pages: canonical, OG/Twitter, FAQPage + SoftwareApplication JSON-LD
- `components/Widgets.jsx` — every PDF engine (client-side)
- `app/sitemap.js`, `app/robots.js` — host-aware, work on any domain
- `public/pdf.worker.min.mjs` — pdf.js worker asset

## Dependency notes

`image-size` is pinned to `2.0.3` via `overrides`. `pptxgenjs@4.0.1` declares
`^1.2.1` but never loads it — the dist has no reference to it, and pptx
generation (text and images) succeeds with the package absent entirely — and
every `1.x` release carries two high advisories that `2.0.3` is outside. Drop
the override when pptxgenjs widens its range.

Part of the Abetworks family — hub links back to https://hub.abetworks.in/.
