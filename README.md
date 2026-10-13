# El Cocotazo

Self-service coconut stand in Las Terrenas. The customer scans a QR code, picks
a quantity, pays by card on the AZUL Payment Page, and the owner gets an email.

Static pages plus two small functions on Cloudflare Pages. No framework, no
build step, no dependencies. Fonts are vendored in `public/fonts/`.

## How a payment flows

1. `public/index.html` posts the quantity to `/api/checkout`.
2. `functions/api/checkout.js` computes the amount, signs the transaction with
   the AZUL AuthKey and returns a form that the browser auto-submits to AZUL.
   The signing has to happen on the server: the AuthKey must never reach the phone.
3. The customer pays on AZUL's page.
4. AZUL sends the browser back to one of three addresses:
   - approved: `/api/approved` (`functions/api/approved.js`), which checks
     AZUL's signature, emails the owner (Brevo, then Resend) and redirects to
     `success.html`
   - approved but the signature cannot be checked: `unconfirmed.html`
   - declined: `declined.html`
   - cancelled: `/`

AZUL has no webhook for card payments. The email is sent when the customer's
browser comes back from AZUL, so a customer who closes the tab at that exact
moment pays without an email being sent. The AZUL merchant portal is the source
of truth for money received.

## Layout

```text
public/            static site (this folder is what Cloudflare publishes)
functions/api/     checkout.js -> POST /api/checkout, approved.js -> GET /api/approved
lib/               azul.js (pricing, hashes), email.js (Brevo/Resend)
test/              node --test
```

Price and maximum quantity are constants at the top of `lib/azul.js`.

## Languages

The HTML is written in Spanish. `public/i18n.js` reads the browser's preferred
languages and swaps in English, French or Italian; anything else stays in
Spanish. To change or add a text, edit the `data-i18n` key in the HTML and the
matching entries in `i18n.js`. AZUL's own page only offers Spanish and English,
so non-Spanish browsers get it in English.

## Decline reasons

When AZUL declines a payment it sends the customer to `declined.html` with the
result in the querystring. `public/payment-errors.js` turns AZUL's `IsoCode`
(and, for code 99, its error text) into one of a dozen customer messages, and
`public/declined.js` shows it with the code underneath, so a customer can read
the code out to you. The code table follows AZUL's "Códigos de Respuesta
Comunes". Unknown codes show the generic "payment did not go through" text.

## Run locally

```sh
npm test                      # no install needed
cp .dev.vars.example .dev.vars   # fill in the values
npm run dev                   # http://localhost:8788, downloads wrangler on first run
```

## Environment variables

Set in Cloudflare Pages under Settings -> Environment variables (mark keys as
"Secret"). Locally they come from `.dev.vars`.

| Variable | Required | Notes |
| :--- | :--- | :--- |
| `AZUL_MERCHANT_ID` | yes | Given by AZUL |
| `AZUL_AUTH_KEY` | yes | Given by AZUL. Secret. |
| `AZUL_URL` | for production | Defaults to the test page `https://pruebas.azul.com.do/PaymentPage/`. Production: `https://pagos.azul.com.do/PaymentPage/Default.aspx` |
| `AZUL_MERCHANT_NAME` | no | Default `El Cocotazo` |
| `AZUL_MERCHANT_TYPE` | no | Default `E-Commerce` |
| `AZUL_CURRENCY_CODE` | no | Default `$`. Use the value AZUL gives you. |
| `OWNER_EMAIL` | yes | Where sale emails go |
| `SENDER_EMAIL` | yes | A sender address verified in Brevo |
| `BREVO_API_KEY` | yes | Secret |
| `RESEND_API_KEY` | yes | Secret. The `resend.dev` sender only delivers to the Resend account's own address, so that must be `OWNER_EMAIL`. |

Until the two required AZUL values are set, the Pay button shows a "not
available yet" page.

## Deploy on Cloudflare Pages

1. Push this repo to GitHub.
2. Cloudflare dashboard -> Workers & Pages -> Create -> Pages -> Connect to Git,
   pick the repo.
3. Build settings: framework preset `None`, build command empty, build output
   directory `public`. Production branch `main`.
4. Add the environment variables above, then redeploy (variables only apply to
   new deployments).
5. Give AZUL the site address if they ask for the return URLs to be registered.

Every push to `main` deploys to production. Any other branch gets its own
preview address, with its own set of environment variables ("Preview").
