# El Cocotazo

Self-service coconut stand in Las Terrenas. The customer scans a QR code, picks
a quantity, pays by card on the AZUL Payment Page, and the owner gets an email.

Static pages plus one small Cloudflare Worker with two routes. No framework,
no build step, no dependencies. Fonts are vendored in `public/fonts/`.

## How a payment flows

1. `public/index.html` posts the quantity to `/api/checkout`.
2. `src/checkout.js` computes the amount, signs the transaction with
   the AZUL AuthKey and returns a form that the browser auto-submits to AZUL.
   The signing has to happen on the server: the AuthKey must never reach the phone.
3. The customer pays on AZUL's page.
4. AZUL sends the browser back to one of three addresses:
   - approved: `/api/approved` (`src/approved.js`), which checks
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
public/            static site, served by Cloudflare as-is
src/               worker.js routes /api/checkout and /api/approved to checkout.js and approved.js
wrangler.jsonc     Cloudflare Worker configuration
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

## Card-acceptance requirements

AZUL's approval asks for a few things on the site, all static in `public/`:

- every page ends with the same footer: Visa, Mastercard, Visa Secure and
  Mastercard ID Check logos (`public/img/`), links to the policies, the
  currency (RD$ / DOP), the merchant address and the contact email and phone.
  It is copied into each HTML file, so a change to it goes in all of them.
- `terminos.html` (product, price, delivery, cancellations, refunds),
  `privacidad.html` and `seguridad.html` (card data security, with the 3D
  Secure logos). These are in Spanish only.
- `success.html` is the payment receipt. `/api/approved` passes it the order,
  quantity, amount, authorization code, AZUL date and the card's last 4 digits.

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
npm run dev                   # http://localhost:8787, downloads wrangler on first run
```

## Environment variables

Set in the Cloudflare dashboard on the Worker, under Settings -> Variables and
Secrets (use type "Secret" for keys). Locally they come from `.dev.vars`.

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

## Deploy on Cloudflare Workers

1. Cloudflare dashboard -> Workers & Pages -> Create -> import the GitHub repo.
2. Project name `cocotazo` (it must match `name` in `wrangler.jsonc`), build
   command empty, deploy command `npx wrangler deploy`.
3. After the first deploy, add the variables above under Settings -> Variables
   and Secrets. `keep_vars` in `wrangler.jsonc` stops later deploys from
   removing them.

Every push to `main` deploys to production at
`cocotazo.<account>.workers.dev`. Other branches get a preview address.
