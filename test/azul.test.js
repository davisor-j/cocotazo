import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';

import {
  buildPaymentFields, newOrderNumber, parseQuantity, signRequest, verifyResponse,
} from '../lib/azul.js';
import { onRequestGet } from '../src/approved.js';
import { onRequestGet as onRequestGetCheckout, onRequestPost } from '../src/checkout.js';

const AUTH_KEY = 'test-auth-key';
const env = { AZUL_MERCHANT_ID: '39038540035', AZUL_AUTH_KEY: AUTH_KEY };

const hmac = (text, encoding) =>
  createHmac('sha512', AUTH_KEY).update(Buffer.from(text, encoding)).digest('hex');

// Builds the querystring AZUL would send to ApprovedUrl, signed like AZUL signs it.
function azulResponse(overrides = {}, encoding = 'utf16le') {
  const values = {
    OrderNumber: '261012193000123',
    Amount: '30000',
    AuthorizationCode: 'OK1234',
    DateTime: '20261012153000',
    ResponseCode: 'ISO8583',
    IsoCode: '00',
    ResponseMessage: 'APROBADA',
    ErrorDescription: '',
    RRN: '628500000001',
    ...overrides,
  };
  const params = new URLSearchParams(values);
  params.set('AuthHash', hmac(Object.values(values).join('') + AUTH_KEY, encoding));
  return params;
}

test('parseQuantity accepts whole numbers from 1 to 20 only', () => {
  assert.equal(parseQuantity('1'), 1);
  assert.equal(parseQuantity('20'), 20);
  for (const bad of ['0', '21', '-1', '1.5', 'abc', '', null]) {
    assert.equal(parseQuantity(bad), null);
  }
});

test('newOrderNumber is 15 digits starting with the UTC timestamp', () => {
  const order = newOrderNumber(new Date('2026-10-12T19:30:05Z'));
  assert.match(order, /^261012193005\d{3}$/);
});

test('buildPaymentFields prices the order and points AZUL back at this site', async () => {
  const fields = await buildPaymentFields({
    env, origin: 'https://cocotazo.pages.dev', quantity: 3, orderNumber: '1',
  });
  assert.equal(fields.Amount, '30000');
  assert.equal(fields.ITBIS, '000');
  assert.equal(fields.CustomField1Value, '3');
  assert.equal(fields.ApprovedUrl, 'https://cocotazo.pages.dev/api/approved');
  assert.equal(fields.DeclinedUrl, 'https://cocotazo.pages.dev/declined.html');
  assert.equal(fields.CancelUrl, 'https://cocotazo.pages.dev/');
});

test('request AuthHash is HMAC-SHA512 of the fields in AZUL order plus the AuthKey', async () => {
  const fields = await buildPaymentFields({
    env, origin: 'https://cocotazo.pages.dev', quantity: 2, orderNumber: '42',
  });
  const expected = hmac(
    '39038540035' + 'El Cocotazo' + 'E-Commerce' + '$' + '42' + '20000' + '000' +
    'https://cocotazo.pages.dev/api/approved' +
    'https://cocotazo.pages.dev/declined.html' +
    'https://cocotazo.pages.dev/' +
    '1' + 'Cocos' + '2' + '0' + '' + '' + AUTH_KEY,
    'utf8');
  assert.equal(fields.AuthHash, expected);
  assert.equal(await signRequest(fields, AUTH_KEY), expected);
});

test('verifyResponse accepts a correctly signed response in either encoding', async () => {
  for (const encoding of ['utf16le', 'utf8']) {
    const sale = await verifyResponse(azulResponse({}, encoding), AUTH_KEY);
    assert.equal(sale.approved, true);
    assert.equal(sale.amountCents, 30000);
    assert.equal(sale.orderNumber, '261012193000123');
  }
});

test('verifyResponse rejects tampered, unsigned or wrongly keyed responses', async () => {
  const tampered = azulResponse();
  tampered.set('Amount', '100');
  assert.equal(await verifyResponse(tampered, AUTH_KEY), null);

  const unsigned = azulResponse();
  unsigned.delete('AuthHash');
  assert.equal(await verifyResponse(unsigned, AUTH_KEY), null);

  assert.equal(await verifyResponse(azulResponse(), 'other-key'), null);
  assert.equal(await verifyResponse(azulResponse(), undefined), null);
});

test('POST /api/checkout answers with a signed form aimed at AZUL', async () => {
  const request = new Request('https://cocotazo.pages.dev/api/checkout', {
    method: 'POST', body: new URLSearchParams({ quantity: '2' }),
  });
  const response = await onRequestPost({ request, env });
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /action="https:\/\/pruebas\.azul\.com\.do\/PaymentPage\/"/);
  assert.match(html, /name="Amount" value="20000"/);
  assert.match(html, /name="AuthHash" value="[0-9a-f]{128}"/);
  assert.ok(!html.includes(AUTH_KEY));
  assert.match(html, /name="Locale" value="ES"/);
});

test('POST /api/checkout asks AZUL for English when the browser is not in Spanish', async () => {
  const request = new Request('https://cocotazo.pages.dev/api/checkout', {
    method: 'POST', body: new URLSearchParams({ quantity: '1' }),
    headers: { 'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8' },
  });
  const html = await (await onRequestPost({ request, env })).text();
  assert.match(html, /name="Locale" value="EN"/);
});

test('POST /api/checkout refuses bad quantities and missing configuration', async () => {
  const post = (quantity, withEnv) => onRequestPost({
    request: new Request('https://cocotazo.pages.dev/api/checkout', {
      method: 'POST', body: new URLSearchParams({ quantity }),
    }),
    env: withEnv,
  });
  assert.equal((await post('999', env)).status, 400);
  assert.equal((await post('2', {})).status, 503);
});

test('POST /api/checkout shows an error page instead of crashing on a broken request', async () => {
  const response = await onRequestPost({
    request: new Request('https://cocotazo.pages.dev/api/checkout', {
      method: 'POST', body: 'not a form', headers: { 'Content-Type': 'application/json' },
    }),
    env,
  });
  assert.equal(response.status, 500);
  assert.match(await response.text(), /Algo salió mal/);
});

test('GET /api/checkout goes back to the home page', () => {
  const response = onRequestGetCheckout({
    request: new Request('https://cocotazo.pages.dev/api/checkout'),
  });
  assert.equal(response.headers.get('Location'), 'https://cocotazo.pages.dev/');
});

const SUCCESS_URL = 'https://cocotazo.pages.dev/success.html?order=261012193000123&qty=3';
const emailEnv = {
  ...env,
  OWNER_EMAIL: 'owner@example.com',
  SENDER_EMAIL: 'sales@example.com',
  BREVO_API_KEY: 'brevo-key',
  RESEND_API_KEY: 'resend-key',
};

// Calls /api/approved with `fetch` replaced by `fakeFetch`; returns where the
// customer is sent and which email APIs were called.
async function approve(params, withEnv, fakeFetch) {
  const called = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    called.push({ url, body: JSON.parse(init.body) });
    return fakeFetch(url);
  };
  try {
    const background = [];
    const response = await onRequestGet({
      request: new Request(`https://cocotazo.pages.dev/api/approved?${params}`),
      env: withEnv,
      waitUntil: (promise) => background.push(promise),
    });
    await Promise.all(background);
    return { location: response.headers.get('Location'), status: response.status, called };
  } finally {
    globalThis.fetch = realFetch;
  }
}

const ok = () => new Response('{}', { status: 201 });
const down = () => new Response('{}', { status: 500 });

test('GET /api/approved emails the owner once via Brevo and redirects to success', async () => {
  const { location, status, called } = await approve(azulResponse(), emailEnv, ok);
  assert.equal(status, 303);
  assert.equal(location, SUCCESS_URL);
  assert.equal(called.length, 1);
  assert.equal(called[0].url, 'https://api.brevo.com/v3/smtp/email');
  assert.equal(called[0].body.to[0].email, 'owner@example.com');
  assert.match(called[0].body.subject, /3 coco\(s\) · RD\$300\.00/);
});

test('GET /api/approved falls back to Resend when Brevo fails', async () => {
  const { location, called } = await approve(azulResponse(), emailEnv,
    (url) => (url.includes('brevo') ? down() : ok()));
  assert.equal(location, SUCCESS_URL);
  assert.deepEqual(called.map((call) => new URL(call.url).host), ['api.brevo.com', 'api.resend.com']);
});

test('GET /api/approved still succeeds when every email provider fails or throws', async () => {
  assert.equal((await approve(azulResponse(), emailEnv, down)).location, SUCCESS_URL);
  const thrown = await approve(azulResponse(), emailEnv, () => { throw new Error('network down'); });
  assert.equal(thrown.location, SUCCESS_URL);
  assert.equal(thrown.called.length, 2);
});

test('GET /api/approved succeeds and calls no email API when email is not configured', async () => {
  const { location, called } = await approve(azulResponse(), env, ok);
  assert.equal(location, SUCCESS_URL);
  assert.equal(called.length, 0);

  const onlyOwner = await approve(azulResponse(), { ...env, OWNER_EMAIL: 'owner@example.com' }, ok);
  assert.equal(onlyOwner.location, SUCCESS_URL);
  assert.equal(onlyOwner.called.length, 0);
});

test('GET /api/approved sends unverifiable results to the unconfirmed page, no email', async () => {
  const forged = azulResponse();
  forged.set('AuthHash', 'f'.repeat(128));
  for (const params of [forged, new URLSearchParams()]) {
    const { location, called } = await approve(params, emailEnv, ok);
    assert.equal(location, 'https://cocotazo.pages.dev/unconfirmed.html');
    assert.equal(called.length, 0);
  }
  // AuthKey missing on the server: nothing can be verified.
  const noKey = await approve(azulResponse(), {}, ok);
  assert.equal(noKey.location, 'https://cocotazo.pages.dev/unconfirmed.html');
});

test('GET /api/approved sends a signed but declined result to the declined page, no email', async () => {
  const declined = azulResponse({ IsoCode: '51', ResponseMessage: 'DECLINADA' });
  const { location, called } = await approve(declined, emailEnv, ok);
  assert.equal(location,
    'https://cocotazo.pages.dev/declined.html?IsoCode=51&ResponseMessage=DECLINADA&ErrorDescription=');
  assert.equal(called.length, 0);
});

// A real response from AZUL's test environment (merchant 39038540035, AZUL's
// published test AuthKey), captured after a card was rejected.
test('verifyResponse accepts a real AZUL test-environment response', async () => {
  const testKey = 'asdhakjshdkjasdasmndajksdkjaskldga8odya9d8yoasyd98asdyaisdhoaisyd0a8sydoashd8oasydoiahdpiashd09ayusidhaos8dy0a8dya08syd0a8ssdsax';
  const params = new URLSearchParams(
    'OrderNumber=261013002403511&Amount=50000&Itbis=000&AuthorizationCode=&DateTime=20261012202517' +
    '&ResponseCode=ISO8583&IsoCode=99&ResponseMessage=ERROR&ResponseFriendlyMessage=' +
    '&ErrorDescription=SGS-002303%3A%20Invalid%20credit%20card%20number&RRN=' +
    '&AuthHash=f9d257582799ff3c53f714c8bba9a4b678524a278a0e24618f75cfcddb3851ffa09e3813120728b5b42c0d0352759aa9388bd4ea55d2e25c433033cdc7238a47' +
    '&CustomOrderId=&CardNumber=42600000****0000&AzulOrderId=44921027');
  const result = await verifyResponse(params, testKey);
  assert.equal(result.approved, false);
  assert.equal(result.amountCents, 50000);
  assert.equal(result.isoCode, '99');
});

test('worker routes the API paths and sends unknown paths home', async () => {
  const { default: worker } = await import('../src/worker.js');
  const ctx = { waitUntil() {} };
  const call = (path, init) =>
    worker.fetch(new Request(`https://cocotazo.example${path}`, init), env, ctx);

  const paid = await call('/api/checkout', { method: 'POST', body: new URLSearchParams({ quantity: '1' }) });
  assert.equal(paid.status, 200);
  assert.equal((await call('/api/checkout')).headers.get('Location'), 'https://cocotazo.example/');
  assert.equal((await call('/api/approved')).headers.get('Location'), 'https://cocotazo.example/unconfirmed.html');
  assert.equal((await call('/nope')).headers.get('Location'), 'https://cocotazo.example/');
});
