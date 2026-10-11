export const PRO = {
  monthly: '$6/mo',
  yearly: '$48/yr (20% off)',
  tasteRuns: 3,
  stripeLink: process.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK || '',
};

const K = 'abetpdf-pro-taste';

export function tasteLeft() {
  try { return Math.max(0, PRO.tasteRuns - (+(localStorage.getItem(K) || 0) || 0)); } catch { return PRO.tasteRuns; }
}
export function consumeTaste() {
  try { localStorage.setItem(K, String((+(localStorage.getItem(K) || 0) || 0) + 1)); } catch { /* private mode */ }
}
export function proLocked() { return tasteLeft() <= 0; }
export const PRO_ERR = `You have used your ${PRO.tasteRuns} free Pro runs — AbetPDF Pro is ${PRO.monthly} (billed ${PRO.yearly}). See /pricing.`;
