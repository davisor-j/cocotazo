// AZUL Payment Page helpers.
// Docs: https://dev.azul.com.do/Pages/developer/pages/lib/index.aspx
//   - "Invocar la Página de Pago"            (fields we POST)
//   - "Manejo de la Autenticación (AuthHash)" (how both hashes are built)

export const PRICE_CENTS = 10000; // RD$100.00 per coconut
export const MAX_QUANTITY = 20;

export const AZUL_TEST_URL = 'https://pruebas.azul.com.do/PaymentPage/';

// Order of the fields in the request hash. AuthKey is appended at the end.
const REQUEST_HASH_FIELDS = [
  'MerchantId', 'MerchantName', 'MerchantType', 'CurrencyCode', 'OrderNumber',
  'Amount', 'ITBIS', 'ApprovedUrl', 'DeclinedUrl', 'CancelUrl',
  'UseCustomField1', 'CustomField1Label', 'CustomField1Value',
  'UseCustomField2', 'CustomField2Label', 'CustomField2Value',
];

// Order of the fields in the hash AZUL sends back to ApprovedUrl/DeclinedUrl.
const RESPONSE_HASH_FIELDS = [
  'OrderNumber', 'Amount', 'AuthorizationCode', 'DateTime', 'ResponseCode',
  'IsoCode', 'ResponseMessage', 'ErrorDescription', 'RRN',
];

const utf8 = (text) => new TextEncoder().encode(text);

// What .NET calls "Unicode": UTF-16 little endian.
function utf16le(text) {
  const bytes = new Uint8Array(text.length * 2);
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    bytes[i * 2] = code & 0xff;
    bytes[i * 2 + 1] = code >> 8;
  }
  return bytes;
}

async function hmacSha512Hex(keyText, messageBytes) {
  const key = await crypto.subtle.importKey(
    'raw', utf8(keyText), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, messageBytes);
  return [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

// Compares two hex strings without leaking where they differ.
function sameHash(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function parseQuantity(raw) {
  const quantity = Number(raw);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) return null;
  return quantity;
}

// Digits only: YYMMDDHHMMSS (UTC) + 3 random digits.
export function newOrderNumber(now = new Date()) {
  const stamp = now.toISOString().replace(/\D/g, '').slice(2, 14);
  const random = String(crypto.getRandomValues(new Uint16Array(1))[0] % 1000).padStart(3, '0');
  return stamp + random;
}

// AZUL accepts the request hash from a UTF-8 or a Unicode string; we use UTF-8.
export async function signRequest(fields, authKey) {
  const text = REQUEST_HASH_FIELDS.map((name) => fields[name] ?? '').join('') + authKey;
  return hmacSha512Hex(authKey, utf8(text));
}

// Every field the browser must POST to the payment page, AuthHash included.
export async function buildPaymentFields({ env, origin, quantity, orderNumber }) {
  const fields = {
    MerchantId: env.AZUL_MERCHANT_ID,
    MerchantName: env.AZUL_MERCHANT_NAME || 'El Cocotazo',
    MerchantType: env.AZUL_MERCHANT_TYPE || 'E-Commerce',
    CurrencyCode: env.AZUL_CURRENCY_CODE || '$',
    OrderNumber: orderNumber,
    Amount: String(quantity * PRICE_CENTS),
    ITBIS: '000',
    ApprovedUrl: `${origin}/api/approved`,
    DeclinedUrl: `${origin}/declined.html`,
    CancelUrl: `${origin}/`,
    UseCustomField1: '1',
    CustomField1Label: 'Cocos',
    CustomField1Value: String(quantity),
    UseCustomField2: '0',
    CustomField2Label: '',
    CustomField2Value: '',
  };
  fields.AuthHash = await signRequest(fields, env.AZUL_AUTH_KEY);
  // Not part of the hash: skip AZUL's own result screen and come straight back to us.
  fields.ShowTransactionResult = '0';
  return fields;
}

// Reads a querystring parameter ignoring case (AZUL docs mix IsoCode / ISOCode).
function param(params, name) {
  for (const [key, value] of params) {
    if (key.toLowerCase() === name.toLowerCase()) return value;
  }
  return '';
}

// Checks the AuthHash AZUL adds to the ApprovedUrl querystring.
// Returns the transaction details, or null if the hash does not match.
export async function verifyResponse(params, authKey) {
  const received = param(params, 'AuthHash').toLowerCase();
  if (!received || !authKey) return null;

  const text = RESPONSE_HASH_FIELDS.map((name) => param(params, name)).join('') + authKey;
  // Docs say the response hash comes from a Unicode string. UTF-8 is accepted too:
  // both need the secret AuthKey, so this does not weaken the check.
  const valid =
    sameHash(received, await hmacSha512Hex(authKey, utf16le(text))) ||
    sameHash(received, await hmacSha512Hex(authKey, utf8(text)));
  if (!valid) return null;

  return {
    orderNumber: param(params, 'OrderNumber'),
    amountCents: Number(param(params, 'Amount')),
    authorizationCode: param(params, 'AuthorizationCode'),
    dateTime: param(params, 'DateTime'),
    isoCode: param(params, 'IsoCode'),
    responseMessage: param(params, 'ResponseMessage'),
    errorDescription: param(params, 'ErrorDescription'),
    rrn: param(params, 'RRN'),
    // Masked by AZUL (e.g. 42600000****0000) and not covered by the hash: display only.
    cardNumber: param(params, 'CardNumber'),
    approved: param(params, 'IsoCode') === '00',
  };
}
