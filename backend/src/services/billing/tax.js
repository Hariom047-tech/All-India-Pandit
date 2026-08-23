const settingsRepo = require('../../repositories/admin/settings.repository');
const { query } = require('../../config/db');

/** Default shape when the admin has never touched billing_tax — OFF, so no
 *  GST is ever invented for a business that hasn't configured a real rate
 *  (per the user's explicit decision: tax infra exists, default OFF). */
const DEFAULT_TAX = {
  enabled: false, name: 'GST', percentage: 0, inclusive: false,
  businessGstin: '', businessLegalName: '', businessAddress: '', invoicePrefix: 'INV',
};

async function getTaxSettings(q = query) {
  const value = await settingsRepo.getByKey(q, 'billing_tax');
  return value && typeof value === 'object' ? { ...DEFAULT_TAX, ...value } : DEFAULT_TAX;
}

/**
 * Splits/adds tax on a base plan price. Always returns 2-decimal rupee
 * amounts (this codebase stores money as DECIMAL rupees, not integer paise
 * — see payments.repository.js's own notes on that).
 *
 * inclusive=false (the common case for a plan price like "₹599/month"):
 *   payable = base + tax, gstAmount = base * pct/100
 * inclusive=true (the sticker price already includes tax):
 *   payable = base (unchanged), gstAmount = base - base/(1+pct/100)
 */
function computeTax(baseAmount, tax) {
  if (!tax.enabled || !tax.percentage) {
    return { payableAmount: round2(baseAmount), gstAmount: 0 };
  }
  const pct = Number(tax.percentage);
  if (tax.inclusive) {
    const gstAmount = round2(baseAmount - baseAmount / (1 + pct / 100));
    return { payableAmount: round2(baseAmount), gstAmount };
  }
  const gstAmount = round2(baseAmount * (pct / 100));
  return { payableAmount: round2(baseAmount + gstAmount), gstAmount };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

module.exports = { getTaxSettings, computeTax, DEFAULT_TAX };
