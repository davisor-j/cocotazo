/**
 * Handler used by src/worker.js
 * Route: POST /api/checkout
 *
 * Receives the quantity from index.html, signs the transaction with the AZUL
 * AuthKey (which must never reach the browser) and answers with a form that
 * the customer's browser auto-submits to the AZUL Payment Page.
 */
import {
  AZUL_TEST_URL, buildPaymentFields, newOrderNumber, parseQuantity,
} from '../lib/azul.js';
import { escapeHtml } from '../lib/email.js';

function page(status, body, scripts = '') {
  return new Response(`<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>El Cocotazo</title>
<link rel="stylesheet" href="/style.css">
</head>
<body>
<main class="board">
<h1>El Cocotazo</h1>
<hr>
${body}
</main>
<script src="/i18n.js"></script>
${scripts}
</body>
</html>`, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

const backLink = '<a class="button" href="/" data-i18n="back">Volver</a>';

// Opening /api/checkout directly (or coming back to it) just returns to the start.
export function onRequestGet({ request }) {
  return Response.redirect(new URL('/', request.url).toString(), 303);
}

export async function onRequestPost({ request, env }) {
  try {
    return await checkout(request, env);
  } catch (err) {
    console.error('Checkout failed', err);
    return page(500, `
      <p class="big" data-i18n="wrong">Algo salió mal</p>
      <p class="note" data-i18n="notCharged">No se hizo ningún cargo. Puedes intentarlo otra vez.</p>
      ${backLink}`);
  }
}

async function checkout(request, env) {
  const form = await request.formData();
  const quantity = parseQuantity(form.get('quantity'));
  if (!quantity) {
    return page(400, `
      <p class="big" data-i18n="invalidQuantity">Cantidad no válida</p>
      ${backLink}`);
  }

  if (!env.AZUL_MERCHANT_ID || !env.AZUL_AUTH_KEY) {
    console.error('AZUL_MERCHANT_ID / AZUL_AUTH_KEY are not configured');
    return page(503, `
      <p class="big" data-i18n="unavailable">El pago en línea todavía no está disponible</p>
      ${backLink}`);
  }

  const fields = await buildPaymentFields({
    env,
    origin: new URL(request.url).origin,
    quantity,
    orderNumber: newOrderNumber(),
  });
  // AZUL's own page only speaks Spanish and English.
  const spanish = (request.headers.get('Accept-Language') || 'es').toLowerCase().startsWith('es');
  fields.Locale = spanish ? 'ES' : 'EN';

  const inputs = Object.entries(fields)
    .map(([name, value]) => `<input type="hidden" name="${name}" value="${escapeHtml(value)}">`)
    .join('\n');

  return page(200, `
    <p class="big" data-i18n="redirecting">Llevándote a AZUL para pagar…</p>
    <form id="azul" method="post" action="${escapeHtml(env.AZUL_URL || AZUL_TEST_URL)}">
    ${inputs}
    <noscript><button class="button" type="submit">Continuar</button></noscript>
    </form>
    `, '<script src="/redirect.js"></script>');
}
