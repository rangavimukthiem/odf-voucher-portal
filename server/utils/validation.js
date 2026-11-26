/**
 * Normalizes a passport number by stripping whitespace and uppercasing.
 */
export function normalizePassport(value) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, '').toUpperCase();
}

/**
 * Validates that a voucher code is strictly 6 numeric digits.
 */
export function isValidSixDigitCode(code) {
  return typeof code === 'string' && /^\d{6}$/.test(code.trim());
}

/**
 * Masks a passport number so cashiers cannot read the last 4 characters off-screen
 * before asking the passenger for confirmation.
 */
export function maskPassport(passport) {
  const normalized = normalizePassport(passport);
  if (!normalized) return '••••••';
  if (normalized.length <= 3) return '•'.repeat(normalized.length);
  return `${normalized.slice(0, 2)}${'•'.repeat(Math.max(4, normalized.length - 2))}`;
}

/**
 * Checks whether cashier-entered verification matches either the full passport
 * number or its last 4 characters (case-insensitive).
 */
export function matchesPassportVerification(actualPassport, submittedInput) {
  const actual = normalizePassport(actualPassport);
  const submitted = normalizePassport(submittedInput);
  if (!actual || !submitted) return false;
  if (submitted === actual) return true;
  if (actual.length >= 4 && submitted.length === 4) {
    return actual.slice(-4) === submitted;
  }
  return false;
}

/**
 * Computes effective voucher status taking expiration timestamp into account.
 */
export function resolveVoucherStatus(row) {
  if (row.status === 'issued' && row.expires_at) {
    const expiresMs = new Date(row.expires_at).getTime();
    if (!Number.isNaN(expiresMs) && expiresMs <= Date.now()) {
      return 'expired';
    }
  }
  return row.status;
}
