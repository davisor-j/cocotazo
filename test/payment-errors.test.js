import assert from 'node:assert/strict';
import { test } from 'node:test';

import { resolvePaymentError } from '../public/payment-errors.js';

test('known ISO codes map to their message, with or without leading zeros', () => {
  const cases = {
    '51': 'errFunds', '54': 'errExpired', '33': 'errExpired', '14': 'errInvalidCard',
    '05': 'errBank', '5': 'errBank', '12': 'errBank', '13': 'errBank', '83': 'errBank',
    '04': 'errCardBlocked', '43': 'errCardBlocked', '08': 'errAuth', '3D': 'errAuth', '3d': 'errAuth',
    '57': 'errNotPermitted', '62': 'errNotPermitted',
    '59': 'errSecurity', '63': 'errSecurity', '82': 'errSecurity',
    '91': 'errRetry', '03': 'errSystem',
  };
  for (const [isoCode, key] of Object.entries(cases)) {
    assert.equal(resolvePaymentError({ isoCode, message: 'DECLINADA' }).key, key, `code ${isoCode}`);
  }
  assert.equal(resolvePaymentError({ isoCode: '05' }).code, '5');
});

test('code 99 is classified from the gateway message', () => {
  const cases = {
    'ERROR SGS-002303: Invalid credit card number': 'errInvalidCard',
    'ERROR FECHA EXPIRACION INVALIDA': 'errExpired',
    'ERROR 3D Secure authentication failed': 'errAuth',
    'ERROR SGS-005002: card brand not supported': 'errBrand',
    'ERROR CCV invalido': 'errCvc',
    'ERROR SGS-030508: request timed out': 'errRetry',
    'ERROR TARJETA INVALIDA': 'errInvalidCard',
  };
  for (const [message, key] of Object.entries(cases)) {
    assert.equal(resolvePaymentError({ isoCode: '99', message }).key, key, message);
  }
});

test('the real AZUL decline we captured resolves to an invalid card with both codes shown', () => {
  const error = resolvePaymentError({
    isoCode: '99', message: 'ERROR SGS-002303: Invalid credit card number',
  });
  assert.deepEqual(error, { key: 'errInvalidCard', code: '99 · SGS-002303' });
});

test('unknown or missing data gives no specific message', () => {
  assert.deepEqual(resolvePaymentError({ isoCode: '99', message: 'ERROR' }), { key: null, code: '99' });
  assert.deepEqual(resolvePaymentError({ isoCode: '77', message: '' }), { key: null, code: '77' });
  assert.deepEqual(resolvePaymentError({}), { key: null, code: '' });
  assert.deepEqual(resolvePaymentError({ isoCode: null, message: null }), { key: null, code: '' });
});

test('text from the address bar is never echoed as the code', () => {
  const error = resolvePaymentError({ isoCode: '<script>alert(1)</script>', message: 'call 555-1234' });
  assert.deepEqual(error, { key: null, code: '' });
});
