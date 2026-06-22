// Indian-format currency helper. ₹1,23,456 (lakh/crore grouping).
//
// Implemented manually (no Intl.toLocaleString) because Hermes' Intl support
// is inconsistent across RN builds, and this app is pinned to specific Hermes
// workarounds. This is dependency-free and deterministic.

export function inr(value, decimals = 0) {
  const n = Number(value);
  if (!isFinite(n)) return '₹0';
  const neg = n < 0;
  const fixed = Math.abs(n).toFixed(decimals);
  let [intPart, frac] = fixed.split('.');

  // Indian grouping: last 3 digits as one group, then groups of 2.
  let last3 = intPart.slice(-3);
  const rest = intPart.slice(0, -3);
  let grouped;
  if (rest) {
    grouped = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
  } else {
    grouped = last3;
  }

  const sign = neg ? '-' : '';
  return `${sign}₹${grouped}${frac ? '.' + frac : ''}`;
}
