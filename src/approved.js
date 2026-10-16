/**
 * Handler used by src/worker.js
 * Route: GET /api/approved
 *
 * AZUL sends the customer's browser here (ApprovedUrl) with the transaction
 * result in the querystring. AZUL has no webhook for card payments, so this
 * is the only moment we learn about a sale: verify the hash, email the owner,
 * then show the static success page.
 */
import { PRICE_CENTS, verifyResponse } from '../lib/azul.js';
import { saleEmail, sendEmailWithFallback } from '../lib/email.js';

export async function onRequestGet({ request, env, waitUntil }) {
  const url = new URL(request.url);
  const redirect = (path) => Response.redirect(new URL(path, url.origin).toString(), 303);

  let sale;
  try {
    sale = await verifyResponse(url.searchParams, env.AZUL_AUTH_KEY);
  } catch (err) {
    console.error('Could not verify AZUL response', err);
    sale = null;
  }

  // The customer may really have paid, so never tell them "you were not charged" here.
  if (!sale) {
    console.warn('Unverified /api/approved call', url.search);
    return redirect('/unconfirmed.html');
  }
  if (!sale.approved) {
    console.warn('AZUL result not approved', JSON.stringify(sale));
    // declined.html reads these to tell the customer why.
    const reason = new URLSearchParams({
      IsoCode: sale.isoCode,
      ResponseMessage: sale.responseMessage,
      ErrorDescription: sale.errorDescription,
    });
    return redirect(`/declined.html?${reason}`);
  }

  const quantity = sale.amountCents / PRICE_CENTS;
  // Kept in the Cloudflare logs as a record even when no email goes out.
  console.log('Sale approved', JSON.stringify({ ...sale, quantity }));

  // Best effort and in the background: the customer never waits on, or sees, email problems.
  try {
    waitUntil(
      sendEmailWithFallback(env, saleEmail(sale, quantity))
        .catch((err) => console.error('Sale email failed', err)),
    );
  } catch (err) {
    console.error('Sale email failed', err);
  }

  // success.html shows these as the customer's payment receipt.
  const receipt = new URLSearchParams({
    order: sale.orderNumber,
    qty: quantity,
    amount: sale.amountCents,
    auth: sale.authorizationCode,
    date: sale.dateTime,
    card: sale.cardNumber.slice(-4),
  });
  return redirect(`/success.html?${receipt}`);
}
