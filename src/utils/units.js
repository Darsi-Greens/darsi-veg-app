// Unit normalization — single source of truth for converting a sale's quantity
// (entered in the user-facing unit) into the vegetable's BASE unit, so stock and
// profit math never mix grams with kilograms.
//
// Sales stores { quantity, unit } where unit ∈ 'kg' | 'gm' | 'pcs'. Stock and
// Analytics aggregate across many sales, so they MUST sum base quantities:
//   - 'gm'  → kilograms (÷1000)
//   - 'kg'  → kilograms (as-is)
//   - 'pcs' → pieces    (as-is; piece/bundle/dozen veg base unit is the piece)
// Without this, a 500 g sale would subtract 500 kg of stock and book 500× COGS.

export const toBaseQty = (qty, unit) => {
  const q = parseFloat(qty) || 0;
  return unit === 'gm' ? q / 1000 : q;
};

// Convenience for aggregators iterating raw sale docs.
export const saleBaseQty = (sale) => toBaseQty(sale?.quantity, sale?.unit);
