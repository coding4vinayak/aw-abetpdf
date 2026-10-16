'use client';
import Link from 'next/link';
import { PRO } from '../lib/premium';

export function ProBadge() {
  return <span className="pro-badge" title="AbetPDF Pro feature">PRO</span>;
}

export function UpgradeNote({ feature }) {
  return (
    <p className="upgrade-note">
      {feature} is an <b>AbetPDF Pro</b> capability — you have used your {PRO.tasteRuns} free tries.
      Unlock it for good at <Link href="/pricing">{PRO.monthly}</Link>. Everything else stays free forever.
    </p>
  );
}

export function TasteMeter({ left }) {
  if (left >= PRO.tasteRuns) return null;
  return <span className="taste-meter">{left === 0 ? 'Pro trial runs used up' : `${left} Pro try${left === 1 ? '' : 's'} left`}</span>;
}
