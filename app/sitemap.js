import { headers } from 'next/headers';
import { TOOLS } from '../lib/tools';

export default async function sitemap() {
  const h = await headers();
  const origin = h.get('origin') || `https://${h.get('host')}`;
  const now = new Date();
  return [
    { url: `${origin}/`, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    ...TOOLS.map((t) => ({ url: `${origin}/${t.slug}`, lastModified: now, changeFrequency: 'monthly', priority: 0.9 })),
    { url: `${origin}/pricing`, lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${origin}/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${origin}/terms`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
  ];
}
