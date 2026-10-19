import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { TOOLS } from '../../../lib/tools';

// Deep check, and honest about what "deep" means for this app: every page is
// generated from TOOLS and every lead capture appends to `data/leads.json`
// next to the app. So the probe proves (a) the registry the build depends on
// actually loaded and is non-empty, and (b) the process can still write the
// leads directory. Render counts only 2xx/3xx as healthy; failure here is 503.
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    if (!Array.isArray(TOOLS) || TOOLS.length === 0) throw new Error('empty tool registry');
    const dir = path.join(process.cwd(), 'data');
    await fs.mkdir(dir, { recursive: true });
    const probe = path.join(dir, `.health-${process.pid}`);
    await fs.writeFile(probe, 'ok');
    await fs.rm(probe, { force: true });
    return NextResponse.json({
      ok: true,
      tools: TOOLS.length,
      storage: 'writable',
      time: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json(
      { ok: false, storage: 'unavailable', time: new Date().toISOString() },
      { status: 503 },
    );
  }
}
