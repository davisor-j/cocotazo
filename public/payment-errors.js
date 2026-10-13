// Turns AZUL's decline data into one of our customer-facing message keys
// (translated in i18n.js). Source: AZUL "Códigos de Respuesta Comunes".

const ISO_CODE_KEYS = {
  '3': 'errSystem',        // configuración inválida (merchant side)
  '4': 'errCardBlocked',   // tarjeta cancelada
  '5': 'errBank',          // declinada por el emisor (do not honor)
  '8': 'errAuth',          // no autenticada
  '12': 'errBank',         // transacción inválida para el tarjetahabiente
  '13': 'errBank',         // monto restringido por el emisor
  '14': 'errInvalidCard',  // número de tarjeta o fecha de expiración inválida
  '33': 'errExpired',
  '43': 'errCardBlocked',  // tarjeta reportada
  '51': 'errFunds',
  '54': 'errExpired',
  '57': 'errNotPermitted', // transacción no permitida para el tarjetahabiente
  '59': 'errSecurity',     // sospecha de fraude
  '62': 'errNotPermitted', // restricción de uso por país
  '63': 'errSecurity',     // bloqueo temporal por seguridad
  '82': 'errSecurity',     // servicio no permitido, bloqueo temporal
  '83': 'errBank',
  '91': 'errRetry',        // emisor no disponible
  '3D': 'errAuth',         // 3D Secure challenge not completed
};

// For code 99, unknown codes or no code at all, AZUL's message is the only signal.
// Order matters: the expiration pattern must precede the generic "invalid" one,
// or "EXPIRACION INVALIDA" is reported as an invalid card number.
const MESSAGE_PATTERNS = [
  [/3D Secure authentication failed/i, 'errAuth'],
  [/expiraci[oó]n|expiration|expiry|vencida/i, 'errExpired'],
  [/SGS-005002|SGS-005996|not (?:supported|setup)|brand.*not/i, 'errBrand'],
  [/CCV|CVV|CVC/i, 'errCvc'],
  [/SGS-030508|SGS-007778|timed? out/i, 'errRetry'],
  [/fondos|insufficient/i, 'errFunds'],
  [/invalid|inv[aá]lida/i, 'errInvalidCard'],
];

/**
 * @param {{ isoCode?: string | null, message?: string | null }} payment
 *   `message` is AZUL's ResponseMessage and ErrorDescription together.
 * @returns {{ key: string | null, code: string }} `key` is null when we have
 *   nothing specific to say; `code` is safe to show ("51", "99 · SGS-002303", or "").
 */
export function resolvePaymentError({ isoCode, message }) {
  const rawCode = isoCode == null ? '' : String(isoCode).trim().toUpperCase();
  // Only short alphanumeric codes are ever shown: this text comes from the address bar.
  const code = /^[0-9A-Z]{1,3}$/.test(rawCode) ? rawCode.replace(/^0+(?=\d)/, '') : '';
  const text = message || '';
  const gatewayCode = (text.match(/SGS-\d{6}/i) || [''])[0].toUpperCase();
  const shown = [code, gatewayCode].filter(Boolean).join(' · ');

  if (ISO_CODE_KEYS[code]) return { key: ISO_CODE_KEYS[code], code: shown };

  for (const [pattern, key] of MESSAGE_PATTERNS) {
    if (pattern.test(text)) return { key, code: shown };
  }

  return { key: null, code: shown };
}
